import { resolveBaseUrl, type AppConfig } from '../types/config'
import { formatProxyError } from './base-url'
import { chatRequest } from './chat-request'
import { calcOtps } from './metrics'
import { proxyRequestHeaders } from './proxy-headers'
import { parseChunkJson, parseSseStream } from './sse-parser'

export interface StreamChatOptions {
  config: AppConfig
  body: Record<string, unknown>
  signal?: AbortSignal
}

export interface StreamChatResult {
  ok: boolean
  ttftMs: number | null
  totalMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  otps: number | null
  httpStatus: number
  error?: string
  contentReceived: boolean
}

export async function streamChatCompletion(
  options: StreamChatOptions,
): Promise<StreamChatResult> {
  const { config, body, signal } = options
  const base = resolveBaseUrl(config)
  const url = `${base}/chat/completions`

  const started = performance.now()
  let ttftMs: number | null = null
  let promptTokens: number | null = null
  let completionTokens: number | null = null
  let contentReceived = false

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...proxyRequestHeaders(config),
      },
      body: JSON.stringify({ stream: true, stream_options: { include_usage: true }, ...body }),
      signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        ok: false,
        ttftMs: null,
        totalMs: null,
        promptTokens: null,
        completionTokens: null,
        otps: null,
        httpStatus: response.status,
        error: formatProxyError(response.status, text),
        contentReceived: false,
      }
    }

    if (!response.body) {
      return {
        ok: false,
        ttftMs: null,
        totalMs: null,
        promptTokens: null,
        completionTokens: null,
        otps: null,
        httpStatus: response.status,
        error: 'Empty response body',
        contentReceived: false,
      }
    }

    for await (const chunk of parseSseStream(response.body)) {
      const parsed = parseChunkJson(chunk.data)
      if (parsed.deltaText && ttftMs === null) {
        ttftMs = performance.now() - started
        contentReceived = true
      }
      if (parsed.usage?.prompt_tokens != null) {
        promptTokens = parsed.usage.prompt_tokens
      }
      if (parsed.usage?.completion_tokens != null) {
        completionTokens = parsed.usage.completion_tokens
      }
    }

    const totalMs = performance.now() - started
    const otps =
      ttftMs != null && completionTokens != null
        ? calcOtps(completionTokens, ttftMs, totalMs)
        : null

    return {
      ok: contentReceived,
      ttftMs,
      totalMs,
      promptTokens,
      completionTokens,
      otps,
      httpStatus: response.status,
      contentReceived,
      error: contentReceived ? undefined : 'No content delta received',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const totalMs = performance.now() - started
    return {
      ok: false,
      ttftMs,
      totalMs,
      promptTokens,
      completionTokens,
      otps: null,
      httpStatus: 0,
      error: message,
      contentReceived,
    }
  }
}

function usageFromJson(json: unknown): {
  promptTokens: number | null
  completionTokens: number | null
} {
  if (!json || typeof json !== 'object') {
    return { promptTokens: null, completionTokens: null }
  }
  const usage = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage
  return {
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: usage?.completion_tokens ?? null,
  }
}

/** 非流式：TTFT 记为整包响应耗时（无首 token 概念） */
export async function nonStreamChatCompletion(
  options: StreamChatOptions,
): Promise<StreamChatResult> {
  const { config, body, signal } = options
  const started = performance.now()

  const res = await chatRequest({
    config,
    body,
    stream: false,
    signal,
  })

  const totalMs = performance.now() - started
  const ok = res.httpStatus >= 200 && res.httpStatus < 300
  const { promptTokens, completionTokens } = usageFromJson(res.json)
  const ttftMs = ok ? totalMs : null
  const otps =
    ttftMs != null && completionTokens != null ? calcOtps(completionTokens, ttftMs, totalMs) : null

  return {
    ok,
    ttftMs,
    totalMs: ok ? totalMs : null,
    promptTokens,
    completionTokens,
    otps,
    httpStatus: res.httpStatus,
    contentReceived: ok && Boolean(res.assistantContent),
    error: ok ? undefined : res.error ?? `HTTP ${res.httpStatus}`,
  }
}

export async function testConnection(config: AppConfig): Promise<{
  ok: boolean
  message: string
}> {
  if (!config.apiKey.trim()) {
    return { ok: false, message: 'API key is required' }
  }
  if (!config.model.trim()) {
    return { ok: false, message: 'Model is required' }
  }

  const result = await streamChatCompletion({
    config,
    body: {
      model: config.model,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 8,
    },
  })

  if (result.ok) {
    return { ok: true, message: `HTTP ${result.httpStatus}, TTFT ${result.ttftMs?.toFixed(0) ?? '?'} ms` }
  }
  return {
    ok: false,
    message: result.error ?? `HTTP ${result.httpStatus}`,
  }
}
