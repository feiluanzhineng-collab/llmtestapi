import type { TtftTierDef } from '../types'
import { nonStreamChatCompletion, streamChatCompletion } from './api-client'
import { estimateTokens, checkTtftSlaP90, summarizeNullable, avg, percentile } from './metrics'
import { buildPromptForTargetTokens } from './prompt-builder'
import { calcRequestsPerTierPerRound, calcTotalRequests } from './ttft-plan'
import { RateLimiter } from './rate-limiter'
import type { AppConfig } from '../types/config'
import type {
  TtftConcurrencyResult,
  TtftRequestLogEntry,
  TtftRunPlan,
  TtftRunReport,
  TtftTierResult,
  TtftTierStats,
} from '../types'

export const TTFT_TIERS: TtftTierDef[] = [
  {
    id: 'lt6k',
    labelKey: '<6K',
    targetTokens: 3000,
    sla: { p50Sec: 2, p90Sec: 5, avgSec: 2 },
    concurrencyLevels: [1, 2, 4, 8],
  },
  {
    id: '6to16k',
    labelKey: '6~16K',
    targetTokens: 10000,
    sla: { p50Sec: 2.5, p90Sec: 5, avgSec: 4 },
    concurrencyLevels: [1, 2, 4, 8],
  },
  {
    id: '16to32k',
    labelKey: '16~32K',
    targetTokens: 22000,
    sla: { p50Sec: 4, p90Sec: 8, avgSec: 6 },
    concurrencyLevels: [1, 2, 4, 8],
  },
  {
    id: '32to64k',
    labelKey: '32~64K',
    targetTokens: 45000,
    sla: { p50Sec: 8, p90Sec: 15, avgSec: 8 },
    concurrencyLevels: [1, 2, 4, 6],
  },
  {
    id: '64to128k',
    labelKey: '64~128K',
    targetTokens: 90000,
    sla: { p50Sec: 15, p90Sec: 35, avgSec: 15 },
    concurrencyLevels: [1, 2, 4],
  },
  {
    id: '128to256k',
    labelKey: '128~256K',
    targetTokens: 180000,
    sla: { p50Sec: 30, p90Sec: 70, avgSec: 30 },
    concurrencyLevels: [1, 2, 3],
  },
]

const SUCCESS_THRESHOLD = 0.99

export interface TtftRunOptions {
  config: AppConfig
  plan: TtftRunPlan
  signal?: AbortSignal
  onProgress?: (event: TtftProgressEvent) => void
}

export type TtftProgressEvent =
  | { type: 'run-start'; totalRequests: number }
  | { type: 'tier-start'; tierId: string; round: number }
  | { type: 'request-update'; entry: TtftRequestLogEntry }
  | { type: 'tier-done'; result: TtftTierResult }
  | { type: 'complete'; report: TtftRunReport }
  | { type: 'error'; message: string }

function buildTierStats(tier: TtftTierDef, logs: TtftRequestLogEntry[]): TtftTierStats {
  const tierAll = logs.filter((l) => l.tierId === tier.id && l.status !== 'pending' && l.status !== 'running')
  const successLogs = tierAll.filter((l) => l.status === 'success')
  const failed = tierAll.filter((l) => l.status === 'error' || l.status === 'cancelled').length
  const total = tierAll.length
  const successRate = total ? successLogs.length / total : 0
  const indicativeOnly = successRate < SUCCESS_THRESHOLD

  const ttftValues = successLogs.map((l) => l.ttftMs).filter((v): v is number => v != null)
  const totalValues = successLogs.map((l) => l.totalMs).filter((v): v is number => v != null)
  const otpsValues = successLogs.map((l) => l.otps).filter((v): v is number => v != null)
  const promptValues = successLogs
    .map((l) => l.promptTokens ?? l.estimatedTokens)
    .filter((v): v is number => v != null)
  const completionValues = successLogs
    .map((l) => l.completionTokens)
    .filter((v): v is number => v != null)

  const ttft = summarizeNullable(ttftValues)
  const totalLatency = summarizeNullable(totalValues)

  let otpsP50: number | null = null
  let otpsP90: number | null = null
  if (otpsValues.length > 0) {
    const sorted = [...otpsValues].sort((a, b) => a - b)
    otpsP50 = percentile(sorted, 0.5)
    otpsP90 = percentile(sorted, 0.9)
  }

  let slaPass: boolean | null = null
  if (ttft.p90Ms != null) {
    slaPass = indicativeOnly ? null : checkTtftSlaP90(ttft.p90Ms, tier.sla.p90Sec)
  }

  return {
    total,
    success: successLogs.length,
    failed,
    successRate,
    ttft,
    totalLatency,
    promptTokensAvg: avg(promptValues),
    promptTokensMin: promptValues.length ? Math.min(...promptValues) : null,
    promptTokensMax: promptValues.length ? Math.max(...promptValues) : null,
    completionTokensAvg: avg(completionValues),
    otpsAvg: avg(otpsValues),
    otpsP50,
    otpsP90,
    slaPass,
    indicativeOnly,
    errors: [
      ...new Set(tierAll.filter((l) => l.error).map((l) => l.error as string)),
    ].slice(0, 3),
  }
}

function buildTierResults(
  tiers: TtftTierDef[],
  logs: TtftRequestLogEntry[],
): TtftTierResult[] {
  return tiers.map((tier) => {
    const stats = buildTierStats(tier, logs)
    const concurrencyResult: TtftConcurrencyResult = {
      concurrency: 1,
      successRate: stats.successRate,
      samples: stats.total,
      p50Ms: stats.ttft.p50Ms,
      p90Ms: stats.ttft.p90Ms,
      avgMs: stats.ttft.avgMs,
      slaPass: stats.slaPass,
      indicativeOnly: stats.indicativeOnly,
      errors: stats.errors,
    }

    return {
      tierId: tier.id,
      targetTokens: tier.targetTokens,
      stats,
      concurrencyResults: [concurrencyResult],
      bestConcurrency: stats.total ? 1 : null,
    }
  })
}

export async function runTtftSuite(options: TtftRunOptions): Promise<TtftRunReport> {
  const { config, plan, signal, onProgress } = options
  const tiers = TTFT_TIERS.filter((t) => plan.selectedTierIds.includes(t.id))
  if (tiers.length === 0) {
    throw new Error('No tiers selected')
  }
  if (plan.rpm <= 0) {
    throw new Error('RPM must be greater than 0')
  }

  const startedAt = new Date().toISOString()
  const limiter = new RateLimiter()
  const logs: TtftRequestLogEntry[] = []
  let requestIndex = 0

  const requestsPerTierPerRound = calcRequestsPerTierPerRound(plan.rpm, plan.durationMin)
  const totalRequests = calcTotalRequests(plan)
  onProgress?.({ type: 'run-start', totalRequests })

  for (let round = 1; round <= plan.rounds; round++) {
    for (const tier of tiers) {
      if (signal?.aborted) break
      onProgress?.({ type: 'tier-start', tierId: tier.id, round })

      const seed = Date.now() % 10000 + requestIndex
      const prompt = buildPromptForTargetTokens(tier.targetTokens, seed)
      const estimatedTokens = estimateTokens(prompt)

      for (let seq = 1; seq <= requestsPerTierPerRound; seq++) {
        if (signal?.aborted) break
        requestIndex++

        const entry: TtftRequestLogEntry = {
          id: crypto.randomUUID(),
          index: requestIndex,
          tierId: tier.id,
          tierLabel: tier.labelKey,
          requestMode: plan.requestMode,
          round,
          seqInRound: seq,
          status: 'pending',
          ttftMs: null,
          totalMs: null,
          promptTokens: null,
          completionTokens: null,
          otps: null,
          estimatedTokens,
        }
        logs.push(entry)
        onProgress?.({ type: 'request-update', entry: { ...entry } })

        try {
          await limiter.acquire(estimatedTokens, plan.rpm, plan.tpm, signal)
        } catch {
          entry.status = 'cancelled'
          onProgress?.({ type: 'request-update', entry: { ...entry } })
          break
        }

        entry.status = 'running'
        entry.startedAt = new Date().toISOString()
        onProgress?.({ type: 'request-update', entry: { ...entry } })

        const chatBody = {
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 16,
        }

        const res =
          plan.requestMode === 'stream'
            ? await streamChatCompletion({ config, signal, body: chatBody })
            : await nonStreamChatCompletion({ config, signal, body: chatBody })

        entry.finishedAt = new Date().toISOString()
        entry.httpStatus = res.httpStatus
        entry.promptTokens = res.promptTokens ?? estimatedTokens
        entry.completionTokens = res.completionTokens
        entry.ttftMs = res.ttftMs
        entry.totalMs = res.totalMs
        entry.otps = res.otps

        if (res.ok) {
          entry.status = 'success'
        } else {
          entry.status = 'error'
          entry.error = res.error ?? `HTTP ${res.httpStatus}`
        }
        onProgress?.({ type: 'request-update', entry: { ...entry } })
      }

      const tierResult = buildTierResults([tier], logs)[0]
      onProgress?.({ type: 'tier-done', result: tierResult })
    }
  }

  const report: TtftRunReport = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: new Date().toISOString(),
    model: config.model,
    baseUrl: config.baseUrl,
    plan,
    requests: [...logs],
    tiers: buildTierResults(tiers, logs),
  }
  onProgress?.({ type: 'complete', report })
  return report
}

export function getTierDef(tierId: string): TtftTierDef | undefined {
  return TTFT_TIERS.find((t) => t.id === tierId)
}

export { calcRequestsPerTierPerRound, calcTotalRequests } from './ttft-plan'
