import type { CompatExpect, CompatStepDef, CompatStepStatus } from '../types/compat'
import type { ChatRequestResult } from './chat-request'

function matchStatus(status: number, expect: CompatExpect): boolean {
  if (expect.statusNot != null && status === expect.statusNot) return false
  if (expect.status == null) return status >= 200 && status < 300
  if (Array.isArray(expect.status)) return expect.status.includes(status)
  return status === expect.status
}

export function evaluateStep(
  step: CompatStepDef,
  res: ChatRequestResult,
): { status: CompatStepStatus; message: string } {
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

  if (expect.sseUsageInLastChunk && !res.sseLastChunkUsage) {
    return { status: 'fail', message: 'Last SSE chunk missing usage field' }
  }

  if (step.stream && res.httpStatus === 200 && !res.sseValid) {
    return { status: 'fail', message: 'Invalid SSE chunk format' }
  }

  return { status: 'pass', message: `HTTP ${res.httpStatus}` }
}

function extractAssistantContent(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const choices = (json as { choices?: Array<{ message?: { content?: string } }> }).choices
  const content = choices?.[0]?.message?.content
  return typeof content === 'string' ? content : null
}

export async function evaluateSeedStability(
  runFn: () => Promise<ChatRequestResult>,
  runs: number,
): Promise<{ status: CompatStepStatus; message: string }> {
  const contents: string[] = []
  for (let i = 0; i < runs; i++) {
    const res = await runFn()
    if (res.httpStatus < 200 || res.httpStatus >= 300) {
      return { status: 'fail', message: `Run ${i + 1} failed: HTTP ${res.httpStatus}` }
    }
    const c = extractAssistantContent(res.json)
    if (c != null) contents.push(c)
  }
  if (contents.length < 2) {
    return { status: 'pass', message: 'Insufficient content to compare' }
  }
  const allSame = contents.every((c) => c === contents[0])
  return allSame
    ? { status: 'pass', message: `${runs} runs with seed: output consistent` }
    : { status: 'fail', message: `${runs} runs with seed: output differs` }
}
