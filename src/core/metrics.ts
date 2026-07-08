export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3))
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const w = idx - lo
  return sorted[lo] * (1 - w) + sorted[hi] * w
}

export function summarizeLatencyMs(values: number[]): {
  p50Ms: number
  p90Ms: number
  avgMs: number
  minMs: number
  maxMs: number
} {
  if (values.length === 0) {
    return { p50Ms: 0, p90Ms: 0, avgMs: 0, minMs: 0, maxMs: 0 }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    p50Ms: percentile(sorted, 0.5),
    p90Ms: percentile(sorted, 0.9),
    avgMs: sum / sorted.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  }
}

export function summarizeNullable(values: number[]): {
  p50Ms: number | null
  p90Ms: number | null
  avgMs: number | null
  minMs: number | null
  maxMs: number | null
} {
  if (values.length === 0) {
    return { p50Ms: null, p90Ms: null, avgMs: null, minMs: null, maxMs: null }
  }
  const s = summarizeLatencyMs(values)
  return s
}

export function calcOtps(completionTokens: number, ttftMs: number, totalMs: number): number | null {
  const genMs = totalMs - ttftMs
  if (completionTokens <= 0 || genMs <= 0) return null
  return completionTokens / (genMs / 1000)
}

export function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function msToSec(ms: number): number {
  return Math.round((ms / 1000) * 1000) / 1000
}

/** 验收标准：以 TTFT P90 为准（对齐文档「官方侧标准」列） */
export function checkTtftSlaP90(p90Ms: number, p90SecLimit: number): boolean {
  return p90Ms <= p90SecLimit * 1000
}

/** @deprecated 文档主判据为 P90 */
export function checkTtftSla(
  _p50Ms: number,
  p90Ms: number,
  _avgMs: number,
  sla: { p50Sec: number; p90Sec: number; avgSec: number },
): boolean {
  return checkTtftSlaP90(p90Ms, sla.p90Sec)
}
