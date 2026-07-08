import type { EngExpect, EngStepDef, EngStepStatus } from '../types/engineering'
import type { ChatRequestResult } from './chat-request'

function matchStatus(status: number, expect: EngExpect): boolean {
  if (expect.statusNot != null && status === expect.statusNot) return false
  if (expect.status == null) return status >= 200 && status < 300
  if (Array.isArray(expect.status)) return expect.status.includes(status)
  return status === expect.status
}

function extractAssistantContent(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const choices = (json as { choices?: Array<{ message?: { content?: string | null } }> }).choices
  const content = choices?.[0]?.message?.content
  return typeof content === 'string' ? content : content === null ? '' : null
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

  if (expect.jsonValid && res.json != null) {
    const content = extractAssistantContent(res.json)
    if (content) {
      try {
        JSON.parse(content)
      } catch {
        return { status: 'fail', message: 'Assistant content is not valid JSON' }
      }
    }
  }

  if (expect.jsonSchemaKeys?.length && res.json != null) {
    const content = extractAssistantContent(res.json)
    if (content) {
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>
        for (const key of expect.jsonSchemaKeys) {
          if (!(key in parsed)) {
            return { status: 'fail', message: `JSON missing key: ${key}` }
          }
        }
      } catch {
        return { status: 'fail', message: 'Assistant content is not valid JSON' }
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

  if (expect.contentIncludes?.length && res.json != null) {
    const content = (extractAssistantContent(res.json) ?? '').toLowerCase()
    for (const s of expect.contentIncludes) {
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
  return { status: 'fail', message: `${msg}（未检测到明显 Cache 命中）` }
}

export async function evaluateJsonRepeat(
  runFn: () => Promise<ChatRequestResult>,
  runs: number,
): Promise<{ status: EngStepStatus; message: string }> {
  let valid = 0
  for (let i = 0; i < runs; i++) {
    const res = await runFn()
    if (res.httpStatus < 200 || res.httpStatus >= 300) {
      return { status: 'fail', message: `Run ${i + 1} failed: HTTP ${res.httpStatus}` }
    }
    const content = extractAssistantContent(res.json)
    if (content) {
      try {
        JSON.parse(content)
        valid++
      } catch {
        return { status: 'fail', message: `Run ${i + 1}: invalid JSON in content` }
      }
    }
  }
  const rate = runs > 0 ? ((valid / runs) * 100).toFixed(0) : '0'
  return valid === runs
    ? { status: 'pass', message: `合法 JSON 率 ${rate}%（${valid}/${runs}）` }
    : { status: 'fail', message: `合法 JSON 率 ${rate}%（${valid}/${runs}）` }
}
