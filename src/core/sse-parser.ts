export function extractDeltaText(delta: Record<string, unknown> | null | undefined): string {
  if (!delta) return ''
  for (const key of ['content', 'reasoning_content', 'text']) {
    const v = delta[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return ''
}

export interface SseChunk {
  data: string
  raw: string
}

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''

      for (const line of parts) {
        const trimmed = line.trimEnd()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trimStart()
        if (data === '[DONE]') return
        yield { data, raw: trimmed }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function parseChunkJson(data: string): {
  deltaText: string
  usage: { prompt_tokens?: number; completion_tokens?: number } | null
  finishReason: string | null
} {
  try {
    const obj = JSON.parse(data) as {
      choices?: Array<{
        delta?: Record<string, unknown>
        finish_reason?: string | null
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const choice = obj.choices?.[0]
    const deltaText = extractDeltaText(choice?.delta)
    return {
      deltaText,
      usage: obj.usage ?? null,
      finishReason: choice?.finish_reason ?? null,
    }
  } catch {
    return { deltaText: '', usage: null, finishReason: null }
  }
}
