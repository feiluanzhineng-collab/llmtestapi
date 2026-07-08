import { chatRequest } from './chat-request'
import { evaluateStep, evaluateSeedStability } from './compat-eval'
import { buildLongInput, getCompatibilityCases } from '../suites/compatibility-cases'
import type { AppConfig } from '../types/config'
import type {
  CompatCaseDef,
  CompatCaseResult,
  CompatRunReport,
  CompatStepDef,
  CompatStepResult,
  CompatStepStatus,
} from '../types/compat'

export interface CompatRunOptions {
  config: AppConfig
  caseIds?: string[]
  includeOptional?: boolean
  signal?: AbortSignal
  onProgress?: (event: CompatProgressEvent) => void
}

export type CompatProgressEvent =
  | { type: 'case-start'; caseId: string }
  | { type: 'step-update'; caseId: string; step: CompatStepResult }
  | { type: 'case-done'; result: CompatCaseResult }
  | { type: 'complete'; report: CompatRunReport }

function resolveBody(
  model: string,
  raw: CompatStepDef['body'],
): Record<string, unknown> {
  if (raw === 'build-long-input') {
    return {
      model,
      messages: [{ role: 'user', content: buildLongInput(500_000) }],
      max_tokens: 8,
    }
  }
  const body = { ...(raw as Record<string, unknown>) }
  if (body.messages && Array.isArray(body.messages)) {
    body.messages = (body.messages as Array<Record<string, unknown>>).map((m) => {
      if (m && typeof m === 'object' && m.content === 'build-long-input') {
        return { ...m, content: buildLongInput(500_000) }
      }
      return m
    })
  }
  if (!body.model) body.model = model
  return body
}

function aggregateCaseStatus(steps: CompatStepResult[]): CompatStepStatus {
  if (steps.some((s) => s.status === 'fail' || s.status === 'error')) return 'fail'
  if (steps.every((s) => s.status === 'skip')) return 'skip'
  if (steps.some((s) => s.status === 'pass')) return 'pass'
  return 'fail'
}

async function runStep(
  config: AppConfig,
  model: string,
  step: CompatStepDef,
  signal?: AbortSignal,
): Promise<CompatStepResult> {
  const base: CompatStepResult = {
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

  const body = resolveBody(model, step.body)

  if (step.expect.seedStable) {
    const evalResult = await evaluateSeedStability(
      () =>
        chatRequest({
          config,
          body,
          stream: false,
          auth: step.auth,
          signal,
        }),
      step.expect.seedStable.runs,
    )
    return {
      ...base,
      status: evalResult.status,
      message: evalResult.message,
      httpStatus: 200,
    }
  }

  const res = await chatRequest({
    config,
    body,
    stream: step.stream,
    auth: step.auth,
    signal,
  })

  const { status, message } = evaluateStep(step, res)
  return {
    ...base,
    status,
    httpStatus: res.httpStatus,
    durationMs: Math.round(res.durationMs),
    message,
    responsePreview: (res.bodyText || res.error || '').slice(0, 200),
  }
}

export async function runCompatibilitySuite(options: CompatRunOptions): Promise<CompatRunReport> {
  const { config, signal, onProgress } = options
  const model = config.model
  let cases = getCompatibilityCases(model)
  if (!options.includeOptional) {
    cases = cases.filter((c) => !c.optional)
  }
  if (options.caseIds?.length) {
    cases = cases.filter((c) => options.caseIds!.includes(c.id))
  }

  const startedAt = new Date().toISOString()
  const results: CompatCaseResult[] = []

  for (const caseDef of cases) {
    if (signal?.aborted) break
    onProgress?.({ type: 'case-start', caseId: caseDef.id })
    const stepResults: CompatStepResult[] = []

    for (const step of caseDef.steps) {
      if (signal?.aborted) break
      const running: CompatStepResult = {
        stepId: step.id,
        label: step.label,
        status: 'running',
        httpStatus: 0,
        durationMs: 0,
        message: '',
        responsePreview: '',
      }
      onProgress?.({ type: 'step-update', caseId: caseDef.id, step: running })

      const result = await runStep(config, model, step, signal)
      stepResults.push(result)
      onProgress?.({ type: 'step-update', caseId: caseDef.id, step: result })
    }

    const caseResult: CompatCaseResult = {
      caseId: caseDef.id,
      subject: caseDef.subject,
      status: aggregateCaseStatus(stepResults),
      steps: stepResults,
    }
    results.push(caseResult)
    onProgress?.({ type: 'case-done', result: caseResult })
  }

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    skip: results.filter((r) => r.status === 'skip').length,
  }

  const report: CompatRunReport = {
    id: crypto.randomUUID(),
    startedAt,
    finishedAt: new Date().toISOString(),
    model,
    baseUrl: config.baseUrl,
    cases: results,
    summary,
  }
  onProgress?.({ type: 'complete', report })
  return report
}

export function listCompatibilityCases(includeOptional = false): CompatCaseDef[] {
  return getCompatibilityCases('').filter((c) => includeOptional || !c.optional)
}
