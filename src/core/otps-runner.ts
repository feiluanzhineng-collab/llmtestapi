import { streamChatCompletion } from './api-client'
import { avg, percentile } from './metrics'
import { OTPS_PROMPT } from './otps-plan'
import { slaTiersForModelSize } from './otps-sla'
import { RateLimiter } from './rate-limiter'
import type { AppConfig } from '../types/config'
import type {
  OtpsLevelResult,
  OtpsLevelStats,
  OtpsRequestLogEntry,
  OtpsRunPlan,
  OtpsRunReport,
  OtpsSlaResult,
} from '../types/otps'

const SUCCESS_THRESHOLD = 0.99

export interface OtpsRunOptions {
  config: AppConfig
  plan: OtpsRunPlan
  signal?: AbortSignal
  onProgress?: (event: OtpsProgressEvent) => void
}

export type OtpsProgressEvent =
  | { type: 'run-start'; totalRequests: number }
  | { type: 'level-start'; concurrency: number }
  | { type: 'request-update'; entry: OtpsRequestLogEntry }
  | { type: 'level-done'; result: OtpsLevelResult }
  | { type: 'complete'; report: OtpsRunReport }

function buildLevelStats(concurrency: number, logs: OtpsRequestLogEntry[]): OtpsLevelStats {
  const levelLogs = logs.filter(
    (l) => l.concurrency === concurrency && l.status !== 'pending' && l.status !== 'running',
  )
  const successLogs = levelLogs.filter((l) => l.status === 'success')
  const failed = levelLogs.filter((l) => l.status === 'error' || l.status === 'cancelled').length
  const total = levelLogs.length
  const successRate = total ? successLogs.length / total : 0
  const indicativeOnly = successRate < SUCCESS_THRESHOLD

  const otpsValues = successLogs.map((l) => l.otps).filter((v): v is number => v != null && v > 0)
  let otpsP50: number | null = null
  let otpsP90: number | null = null
  if (otpsValues.length > 0) {
    const sorted = [...otpsValues].sort((a, b) => a - b)
    otpsP50 = percentile(sorted, 0.5)
    otpsP90 = percentile(sorted, 0.9)
  }

  return {
    concurrency,
    total,
    success: successLogs.length,
    failed,
    successRate,
    otpsAvg: avg(otpsValues),
    otpsP50,
    otpsP90,
    indicativeOnly,
    errors: [
      ...new Set(levelLogs.filter((l) => l.error).map((l) => l.error as string)),
    ].slice(0, 3),
  }
}

function buildSlaResults(plan: OtpsRunPlan, levels: OtpsLevelResult[]): OtpsSlaResult[] {
  const qualifying = levels
    .filter((l) => !l.stats.indicativeOnly && l.stats.otpsP50 != null)
    .sort((a, b) => b.concurrency - a.concurrency)

  const best = qualifying[0] ?? null
  const measuredOtps = best?.stats.otpsP50 ?? null
  const sourceConcurrency = best?.concurrency ?? null
  const noQualifying = qualifying.length === 0

  return slaTiersForModelSize(plan.modelSize).map((tier) => {
    let pass: boolean | null = null
    let note = ''
    if (noQualifying) {
      note = '无成功率≥99%的并发档，OTPS 不具备参考性'
    } else if (measuredOtps != null) {
      pass = measuredOtps >= tier.minOtps
      note = `采信并发 ${sourceConcurrency}，OTPS P50=${measuredOtps.toFixed(1)} tokens/s`
    }
    return {
      tierId: tier.id,
      labelKey: tier.labelKey,
      minOtps: tier.minOtps,
      sourceConcurrency,
      measuredOtps,
      pass,
      indicativeOnly: noQualifying,
      note,
    }
  })
}

async function runConcurrentLevel(
  config: AppConfig,
  plan: OtpsRunPlan,
  concurrency: number,
  logs: OtpsRequestLogEntry[],
  limiter: RateLimiter,
  signal: AbortSignal | undefined,
  onProgress: OtpsRunOptions['onProgress'],
  startIndex: number,
): Promise<number> {
  let requestIndex = startIndex
  const estimatedTokens = 120
  let completed = 0

  while (completed < plan.requestsPerLevel) {
    if (signal?.aborted) break

    const batchSize = Math.min(concurrency, plan.requestsPerLevel - completed)
    const tasks: Promise<void>[] = []

    for (let b = 0; b < batchSize; b++) {
      completed++
      requestIndex++
      const seqInLevel = completed

      const entry: OtpsRequestLogEntry = {
        id: crypto.randomUUID(),
        index: requestIndex,
        concurrency,
        seqInLevel,
        status: 'pending',
        ttftMs: null,
        totalMs: null,
        promptTokens: null,
        completionTokens: null,
        otps: null,
      }
      logs.push(entry)
      onProgress?.({ type: 'request-update', entry: { ...entry } })

      tasks.push(
        (async () => {
          try {
            await limiter.acquire(estimatedTokens + plan.maxTokens, plan.rpm, plan.tpm, signal)
          } catch {
            entry.status = 'cancelled'
            onProgress?.({ type: 'request-update', entry: { ...entry } })
            return
          }

          entry.status = 'running'
          entry.startedAt = new Date().toISOString()
          onProgress?.({ type: 'request-update', entry: { ...entry } })

          const res = await streamChatCompletion({
            config,
            signal,
            body: {
              model: config.model,
              messages: [{ role: 'user', content: OTPS_PROMPT }],
              max_tokens: plan.maxTokens,
            },
          })

          entry.finishedAt = new Date().toISOString()
          entry.httpStatus = res.httpStatus
          entry.promptTokens = res.promptTokens
          entry.completionTokens = res.completionTokens
          entry.ttftMs = res.ttftMs
          entry.totalMs = res.totalMs
          entry.otps = res.otps

          if (res.ok && res.otps != null && res.otps > 0) {
            entry.status = 'success'
          } else if (res.ok) {
            entry.status = 'error'
            entry.error = '无有效 OTPS（输出 token 过少或耗时异常）'
          } else {
            entry.status = 'error'
            entry.error = res.error ?? `HTTP ${res.httpStatus}`
          }
          onProgress?.({ type: 'request-update', entry: { ...entry } })
        })(),
      )
    }

    await Promise.all(tasks)
  }

  return requestIndex
}

export async function runOtpsSuite(options: OtpsRunOptions): Promise<OtpsRunReport> {
  const { config, plan, signal, onProgress } = options
  if (plan.concurrencyLevels.length === 0) {
    throw new Error('No concurrency levels selected')
  }
  if (plan.requestsPerLevel <= 0) {
    throw new Error('requestsPerLevel must be greater than 0')
  }
  if (plan.rpm <= 0) {
    throw new Error('RPM must be greater than 0')
  }

  const startedAt = new Date().toISOString()
  const logs: OtpsRequestLogEntry[] = []
  const limiter = new RateLimiter()
  const totalRequests = plan.concurrencyLevels.length * plan.requestsPerLevel
  onProgress?.({ type: 'run-start', totalRequests })

  let requestIndex = 0
  const levelResults: OtpsLevelResult[] = []

  for (const concurrency of plan.concurrencyLevels) {
    if (signal?.aborted) break
    onProgress?.({ type: 'level-start', concurrency })

    requestIndex = await runConcurrentLevel(
      config,
      plan,
      concurrency,
      logs,
      limiter,
      signal,
      onProgress,
      requestIndex,
    )

    const stats = buildLevelStats(concurrency, logs)
    const result: OtpsLevelResult = { concurrency, stats }
    levelResults.push(result)
    onProgress?.({ type: 'level-done', result })
  }

  const slaResults = buildSlaResults(plan, levelResults)

  const report: OtpsRunReport = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: new Date().toISOString(),
    model: config.model,
    baseUrl: config.baseUrl,
    plan,
    requests: [...logs],
    levels: levelResults,
    slaResults,
  }
  onProgress?.({ type: 'complete', report })
  return report
}
