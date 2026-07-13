import type { EngExpect, EngStepDef, EngStepStatus } from '../types/engineering'
import type { ChatRequestResult } from './chat-request'
import { extractAssistantText } from './extract-assistant-text'

/** json_object 合规率默认通过阈值（固定 temperature=0 + seed 下要求 100%） */
export const JSON_REPEAT_DEFAULT_MIN_PASS_RATE = 1

function matchStatus(status: number, expect: EngExpect): boolean {
  if (expect.statusNot != null && status === expect.statusNot) return false
  if (expect.status == null) return status >= 200 && status < 300
  if (Array.isArray(expect.status)) return expect.status.includes(status)
  return status === expect.status
}

function assistantText(res: ChatRequestResult): string {
  if (typeof res.assistantContent === 'string' && res.assistantContent.trim()) {
    return res.assistantContent.trim()
  }
  return extractAssistantText(res.json)
}

function stripMarkdownJsonFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

export function tryParseAssistantJson(text: string): unknown | null {
  const candidate = stripMarkdownJsonFence(text)
  if (!candidate) return null
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function extractToolCalls(json: unknown): unknown[] {
  if (!json || typeof json !== 'object') return []
  const msg = (json as { choices?: Array<{ message?: { tool_calls?: unknown[] } }> }).choices?.[0]
    ?.message
  return Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
}

function extractReasoning(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false
  const msg = (json as {
    choices?: Array<{ message?: Record<string, unknown> }>
  }).choices?.[0]?.message
  if (!msg) return false
  for (const key of ['reasoning_content', 'reasoning', 'thinking']) {
    const v = msg[key]
    if (typeof v === 'string' && v.length > 0) return true
  }
  return false
}

export function evaluateEngStep(
  step: EngStepDef,
  res: ChatRequestResult,
): { status: EngStepStatus; message: string } {
  if (step.skip) {
    return { status: 'skip', message: step.skipReason ?? 'Skipped' }
  }
  if (res.error && res.httpStatus === 0) {
    return { status: 'error', message: res.error }
  }

  const { expect } = step
  if (!matchStatus(res.httpStatus, expect)) {
    return {
      status: 'fail',
      message: `Expected HTTP ${JSON.stringify(expect.status ?? '2xx')}, got ${res.httpStatus}`,
    }
  }

  const text = res.bodyText
  for (const s of expect.bodyIncludes ?? []) {
    if (!text.includes(s)) {
      return { status: 'fail', message: `Response should include: ${s}` }
    }
  }
  for (const s of expect.bodyExcludes ?? []) {
    if (text.includes(s)) {
      return { status: 'fail', message: `Response should not include: ${s}` }
    }
  }

  const httpOk = res.httpStatus >= 200 && res.httpStatus < 300

  if (expect.jsonValid && httpOk && res.json != null) {
    const content = assistantText(res)
    if (!content) {
      return { status: 'fail', message: 'Assistant content is empty' }
    }
    if (tryParseAssistantJson(content) == null) {
      return { status: 'fail', message: 'Assistant content is not valid JSON' }
    }
  }

  if (expect.jsonSchemaKeys?.length && httpOk && res.json != null) {
    const content = assistantText(res)
    if (!content) {
      return { status: 'fail', message: 'Assistant content is empty' }
    }
    const parsed = tryParseAssistantJson(content)
    if (parsed == null || typeof parsed !== 'object') {
      return { status: 'fail', message: 'Assistant content is not valid JSON' }
    }
    const obj = parsed as Record<string, unknown>
    for (const key of expect.jsonSchemaKeys) {
      if (!(key in obj)) {
        return { status: 'fail', message: `JSON missing key: ${key}` }
      }
    }
  }

  if (expect.sseUsageInLastChunk && !res.sseLastChunkUsage) {
    return { status: 'fail', message: 'Last SSE chunk missing usage field' }
  }

  if (step.stream && res.httpStatus === 200 && !res.sseValid) {
    return { status: 'fail', message: 'Invalid SSE chunk format' }
  }

  if (expect.hasToolCalls) {
    const calls = extractToolCalls(res.json)
    if (calls.length === 0) {
      return { status: 'fail', message: 'Expected tool_calls in response' }
    }
    const min = expect.minToolCalls ?? 1
    if (calls.length < min) {
      return {
        status: 'fail',
        message: `Expected at least ${min} tool_calls, got ${calls.length}`,
      }
    }
  }

  if (expect.hasReasoning && !extractReasoning(res.json) && !res.bodyText.includes('reasoning')) {
    return { status: 'fail', message: 'Expected reasoning/thinking content in response' }
  }

  if (res.json != null) {
    const content = assistantText(res).toLowerCase()

    if (expect.contentIncludesAny?.length) {
      const hit = expect.contentIncludesAny.some((s) => content.includes(s.toLowerCase()))
      if (!hit) {
        return {
          status: 'fail',
          message: `Response should mention one of: ${expect.contentIncludesAny.join(', ')}`,
        }
      }
    }

    for (const s of expect.contentIncludes ?? []) {
      if (!content.includes(s.toLowerCase())) {
        return { status: 'fail', message: `Response should mention: ${s}` }
      }
    }
  }

  return { status: 'pass', message: `HTTP ${res.httpStatus}` }
}

export interface EosBatchStats {
  total: number
  stopCount: number
  emptyContentCount: number
  emptyRatio: number
}

export function evaluateEosBatch(stats: EosBatchStats): { status: EngStepStatus; message: string } {
  if (stats.total === 0) {
    return { status: 'fail', message: 'No samples collected' }
  }
  const ratioPct = (stats.emptyRatio * 100).toFixed(1)
  const msg = `${stats.total} 次：finish_reason=stop ${stats.stopCount} 条，content 为空 ${stats.emptyContentCount} 条，比例 ${ratioPct}%`
  if (stats.emptyRatio > 0.01) {
    return { status: 'fail', message: msg }
  }
  return { status: 'pass', message: msg }
}

export function evaluateCacheCompare(
  firstMs: number,
  secondMs: number,
  cachedTokens?: number,
): { status: EngStepStatus; message: string } {
  const improvement = firstMs > 0 ? ((firstMs - secondMs) / firstMs) * 100 : 0
  const cacheHint = cachedTokens != null && cachedTokens > 0 ? `，cached_tokens=${cachedTokens}` : ''
  const msg = `首次 ${Math.round(firstMs)}ms，二次 ${Math.round(secondMs)}ms，延迟变化 ${improvement.toFixed(1)}%${cacheHint}`
  if (cachedTokens != null && cachedTokens > 0) {
    return { status: 'pass', message: msg }
  }
  if (secondMs < firstMs * 0.85) {
    return { status: 'pass', message: msg }
  }
  return {
    status: 'skip',
    message: `${msg}（无 cached_tokens 且延迟无显著差异，跳过）`,
  }
}

export async function evaluateJsonRepeat(
  runFn: () => Promise<ChatRequestResult>,
  runs: number,
  minPassRate = JSON_REPEAT_DEFAULT_MIN_PASS_RATE,
): Promise<{ status: EngStepStatus; message: string }> {
  let valid = 0
  let httpFail = 0
  let empty = 0
  let jsonFail = 0

  for (let i = 0; i < runs; i++) {
    const res = await runFn()
    if (res.httpStatus < 200 || res.httpStatus >= 300) {
      httpFail++
      continue
    }
    const content = assistantText(res)
    if (!content) {
      empty++
      continue
    }
    if (tryParseAssistantJson(content) != null) {
      valid++
    } else {
      jsonFail++
    }
  }

  const rate = runs > 0 ? valid / runs : 0
  const ratePct = (rate * 100).toFixed(0)
  const thresholdPct = (minPassRate * 100).toFixed(0)
  const detail =
    httpFail || empty || jsonFail
      ? `（HTTP 失败 ${httpFail}，空 content ${empty}，JSON 无效 ${jsonFail}）`
      : ''
  const msg = `合法 JSON 率 ${ratePct}%（${valid}/${runs}，阈值 ≥${thresholdPct}%）${detail}`

  return rate >= minPassRate ? { status: 'pass', message: msg } : { status: 'fail', message: msg }
}

export async function evaluateMajorityRepeat(
  step: EngStepDef,
  runFn: () => Promise<ChatRequestResult>,
  runs: number,
  minPassCount: number,
): Promise<{
  status: EngStepStatus
  message: string
  lastHttpStatus: number
  totalMs: number
  preview: string
}> {
  let pass = 0
  let lastRes: ChatRequestResult | null = null
  let totalMs = 0
  const failures: string[] = []

  for (let i = 0; i < runs; i++) {
    const res = await runFn()
    lastRes = res
    totalMs += res.durationMs
    const { status, message } = evaluateEngStep(step, res)
    if (status === 'pass') pass++
    else failures.push(`#${i + 1} ${message}`)
  }

  const need = Math.min(minPassCount, runs)
  const detail = failures.length ? `；失败：${failures.join('；')}` : ''
  const msg = `确定性复验 ${pass}/${runs} 通过（需 ≥${need}）${detail}`

  return {
    status: pass >= need ? 'pass' : 'fail',
    message: msg,
    lastHttpStatus: lastRes?.httpStatus ?? 0,
    totalMs,
    preview: (lastRes?.bodyText || lastRes?.error || '').slice(0, 200),
  }
}
