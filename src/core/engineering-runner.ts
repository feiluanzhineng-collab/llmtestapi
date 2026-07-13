import { chatRequest } from './chat-request'
import {
  evaluateCacheCompare,
  evaluateEngStep,
  evaluateEosBatch,
  evaluateJsonRepeat,
  evaluateMajorityRepeat,
} from './engineering-eval'
import { getEngineeringCases } from '../suites/engineering-cases'
import { randomUUID } from './random-id'
import type { AppConfig } from '../types/config'
import type {
  EngCaseDef,
  EngCaseResult,
  EngManualOverride,
  EngRunReport,
  EngStepDef,
  EngStepResult,
  EngStepStatus,
} from '../types/engineering'

export interface EngRunOptions {
  config: AppConfig
  caseIds?: string[]
  includeOptional?: boolean
  eosRuns?: number
  signal?: AbortSignal
  onProgress?: (event: EngProgressEvent) => void
}

export type EngProgressEvent =
  | { type: 'case-start'; caseId: string }
  | { type: 'step-update'; caseId: string; step: EngStepResult }
  | { type: 'case-done'; result: EngCaseResult }
  | { type: 'complete'; report: EngRunReport }

function aggregateCaseStatus(steps: EngStepResult[], mode: EngCaseDef['mode']): EngStepStatus {
  if (steps.length === 0 && mode === 'manual') return 'manual'
  if (steps.some((s) => s.status === 'fail' || s.status === 'error')) return 'fail'
  if (steps.every((s) => s.status === 'skip')) return 'skip'
  if (steps.some((s) => s.status === 'pass')) return 'pass'
  if (steps.length === 0) return 'manual'
  return 'fail'
}

type StepProgressFn = (partial: EngStepResult) => void

async function runEosBatch(
  config: AppConfig,
  step: EngStepDef,
  runs: number,
  signal?: AbortSignal,
  onProgress?: StepProgressFn,
): Promise<EngStepResult> {
  const base: EngStepResult = {
    stepId: step.id,
    label: step.label,
    status: 'running',
    httpStatus: 0,
    durationMs: 0,
    message: `0/${runs}`,
    responsePreview: '',
  }
  onProgress?.(base)

  let stopCount = 0
  let emptyContentCount = 0
  let successCount = 0
  let failCount = 0
  let totalMs = 0
  let lastHttpStatus = 0
  const eosTimeoutMs = Math.min(config.timeoutMs, 90_000)

  for (let i = 0; i < runs; i++) {
    if (signal?.aborted) break
    const res = await chatRequest({
      config,
      body: step.body,
      signal,
      timeoutMs: eosTimeoutMs,
    })
    totalMs += res.durationMs
    lastHttpStatus = res.httpStatus

    if (res.httpStatus >= 200 && res.httpStatus < 300) {
      successCount++
      if (res.finishReason === 'stop') stopCount++
      const content = res.assistantContent
      if (content === '' || content === null) emptyContentCount++
    } else {
      failCount++
    }

    onProgress?.({
      ...base,
      status: 'running',
      httpStatus: res.httpStatus,
      durationMs: Math.round(totalMs),
      message: `进度 ${i + 1}/${runs}（成功 ${successCount}，失败 ${failCount}）`,
    })
  }

  if (successCount === 0) {
    const skipThinking = lastHttpStatus === 400
    return {
      ...base,
      status: skipThinking ? 'skip' : 'fail',
      httpStatus: lastHttpStatus,
      durationMs: Math.round(totalMs),
      message: skipThinking
        ? '模型不支持 thinking 参数 (HTTP 400)'
        : `${runs} 次请求均无有效响应（可能超时或网络异常）`,
    }
  }

  const stats = {
    total: successCount,
    stopCount,
    emptyContentCount,
    emptyRatio: emptyContentCount / successCount,
  }
  const { status, message } = evaluateEosBatch(stats)
  return { ...base, status, httpStatus: 200, durationMs: Math.round(totalMs), message }
}

async function runCacheCompare(
  config: AppConfig,
  step: EngStepDef,
  signal?: AbortSignal,
): Promise<EngStepResult> {
  const base: EngStepResult = {
    stepId: step.id,
    label: step.label,
    status: 'running',
    httpStatus: 0,
    durationMs: 0,
    message: '',
    responsePreview: '',
  }

  const first = await chatRequest({ config, body: step.body, signal })
  if (first.httpStatus < 200 || first.httpStatus >= 300) {
    return {
      ...base,
      status: 'fail',
      httpStatus: first.httpStatus,
      durationMs: Math.round(first.durationMs),
      message: `First request failed: HTTP ${first.httpStatus}`,
    }
  }

  const second = await chatRequest({ config, body: step.body, signal })
  const { status, message } = evaluateCacheCompare(
    first.durationMs,
    second.durationMs,
    second.cachedTokens,
  )
  return {
    ...base,
    status,
    httpStatus: second.httpStatus,
    durationMs: Math.round(first.durationMs + second.durationMs),
    message,
  }
}

async function runJsonRepeat(
  config: AppConfig,
  step: EngStepDef,
  runs: number,
  signal?: AbortSignal,
): Promise<EngStepResult> {
  const base: EngStepResult = {
    stepId: step.id,
    label: step.label,
    status: 'running',
    httpStatus: 0,
    durationMs: 0,
    message: '',
    responsePreview: '',
  }

  const minPassRate = step.handlerOptions?.minPassRate
  const { status, message } = await evaluateJsonRepeat(
    () => chatRequest({ config, body: step.body, signal }),
    runs,
    minPassRate,
  )
  return { ...base, status, httpStatus: 200, message }
}

async function runMajorityRepeat(
  config: AppConfig,
  step: EngStepDef,
  signal?: AbortSignal,
): Promise<EngStepResult> {
  const base: EngStepResult = {
    stepId: step.id,
    label: step.label,
    status: 'running',
    httpStatus: 0,
    durationMs: 0,
    message: '',
    responsePreview: '',
  }

  const runs = step.handlerOptions?.repeatCount ?? 3
  const minPassCount = step.handlerOptions?.minPassCount ?? runs
  const { status, message, lastHttpStatus, totalMs, preview } = await evaluateMajorityRepeat(
    step,
    () =>
      chatRequest({
        config,
        body: step.body,
        stream: step.stream,
        auth: step.auth,
        signal,
      }),
    runs,
    minPassCount,
  )
  return {
    ...base,
    status,
    httpStatus: lastHttpStatus,
    durationMs: Math.round(totalMs),
    message,
    responsePreview: preview,
  }
}

async function runStep(
  config: AppConfig,
  step: EngStepDef,
  eosRuns: number,
  signal?: AbortSignal,
  onProgress?: StepProgressFn,
): Promise<EngStepResult> {
  const base: EngStepResult = {
    stepId: step.id,
    label: step.label,
    status: 'running',
    httpStatus: 0,
    durationMs: 0,
    message: '',
    responsePreview: '',
  }

  if (step.skip) {
    return { ...base, status: 'skip', message: step.skipReason ?? 'Skipped' }
  }

  if (step.handler === 'eos-batch') {
    return runEosBatch(config, step, eosRuns, signal, onProgress)
  }
  if (step.handler === 'cache-compare') {
    return runCacheCompare(config, step, signal)
  }
  if (step.handler === 'json-repeat') {
    return runJsonRepeat(config, step, step.handlerOptions?.repeatCount ?? 10, signal)
  }
  if (step.handler === 'majority-repeat') {
    return runMajorityRepeat(config, step, signal)
  }

  const res = await chatRequest({
    config,
    body: step.body,
    stream: step.stream,
    auth: step.auth,
    signal,
  })

  const { status, message } = evaluateEngStep(step, res)
  return {
    ...base,
    status,
    httpStatus: res.httpStatus,
    durationMs: Math.round(res.durationMs),
    message,
    responsePreview: (res.bodyText || res.error || '').slice(0, 200),
  }
}

export async function runEngineeringSuite(options: EngRunOptions): Promise<EngRunReport> {
  const { config, signal, onProgress, eosRuns = 100 } = options
  const model = config.model
  let cases = getEngineeringCases(model)
  if (!options.includeOptional) {
    cases = cases.filter((c) => !c.optional)
  }
  if (options.caseIds?.length) {
    cases = cases.filter((c) => options.caseIds!.includes(c.id))
  }

  const startedAt = new Date().toISOString()
  const results: EngCaseResult[] = []
  const manualOverrides: Record<string, EngManualOverride> = {}

  for (const caseDef of cases) {
    if (signal?.aborted) break
    onProgress?.({ type: 'case-start', caseId: caseDef.id })

    if (caseDef.mode === 'manual') {
      manualOverrides[caseDef.id] = { status: 'na', notes: '' }
      const caseResult: EngCaseResult = {
        caseId: caseDef.id,
        subject: caseDef.subject,
        status: 'manual',
        steps: [],
      }
      results.push(caseResult)
      onProgress?.({ type: 'case-done', result: caseResult })
      continue
    }

    const stepResults: EngStepResult[] = []
    for (const step of caseDef.steps) {
      if (signal?.aborted) break
      const running: EngStepResult = {
        stepId: step.id,
        label: step.label,
        status: 'running',
        httpStatus: 0,
        durationMs: 0,
        message: '',
        responsePreview: '',
      }
      onProgress?.({ type: 'step-update', caseId: caseDef.id, step: running })

      const result = await runStep(config, step, eosRuns, signal, (partial) => {
        onProgress?.({
          type: 'step-update',
          caseId: caseDef.id,
          step: { ...running, ...partial },
        })
      })
      stepResults.push(result)
      onProgress?.({ type: 'step-update', caseId: caseDef.id, step: result })
    }

    const caseResult: EngCaseResult = {
      caseId: caseDef.id,
      subject: caseDef.subject,
      status: aggregateCaseStatus(stepResults, caseDef.mode),
      steps: stepResults,
    }

    if (caseDef.id === 'thinking-toggle') {
      const all400 = stepResults.every((s) => s.httpStatus === 400)
      if (all400) {
        caseResult.status = 'skip'
        caseResult.steps = stepResults.map((s) => ({
          ...s,
          status: 'skip' as EngStepStatus,
          message: '模型不支持 thinking 参数 (HTTP 400)',
        }))
      }
    }

    results.push(caseResult)
    onProgress?.({ type: 'case-done', result: caseResult })
  }

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    skip: results.filter((r) => r.status === 'skip').length,
    manual: results.filter((r) => r.status === 'manual').length,
  }

  const report: EngRunReport = {
    id: randomUUID(),
    startedAt,
    finishedAt: new Date().toISOString(),
    model,
    baseUrl: config.baseUrl,
    cases: results,
    manualOverrides,
    summary,
  }
  onProgress?.({ type: 'complete', report })
  return report
}

export function listEngineeringCaseDefs(includeOptional = false): EngCaseDef[] {
  return getEngineeringCases('').filter((c) => includeOptional || !c.optional)
}
