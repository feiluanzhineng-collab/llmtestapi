import { resolveBaseUrl, type AppConfig } from '../types/config'
import { formatProxyError } from './base-url'
import { proxyRequestHeaders } from './proxy-headers'
import { extractAssistantText } from './extract-assistant-text'
import { parseChunkJson, parseSseStream } from './sse-parser'

export interface ChatRequestOptions {
  config: AppConfig
  body: Record<string, unknown>
  stream?: boolean
  auth?: 'default' | 'none' | 'invalid'
  signal?: AbortSignal
  /** 单次请求超时（毫秒），默认用 config.timeoutMs */
  timeoutMs?: number
}

export interface ChatRequestResult {
  httpStatus: number
  bodyText: string
  json: unknown | null
  durationMs: number
  sseLastChunkUsage: boolean
  sseValid: boolean
  error?: string
  finishReason?: string | null
  assistantContent?: string | null
  cachedTokens?: number
}

const INVALID_KEY = 'sk-invalid-compat-test-key'

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort()
      return ctrl.signal
    }
    s.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  return ctrl.signal
}

function requestSignal(userSignal?: AbortSignal, timeoutMs?: number): AbortSignal | undefined {
  const parts: AbortSignal[] = []
  if (userSignal) parts.push(userSignal)
  if (timeoutMs != null && timeoutMs > 0) parts.push(AbortSignal.timeout(timeoutMs))
  if (parts.length === 0) return undefined
  if (parts.length === 1) return parts[0]
  return combineSignals(parts)
}

function extractResponseMeta(json: unknown | null): {
  finishReason: string | null
  assistantContent: string | null
  cachedTokens: number | undefined
} {
  if (!json || typeof json !== 'object') {
    return { finishReason: null, assistantContent: null, cachedTokens: undefined }
  }
  const obj = json as {
    choices?: Array<{ finish_reason?: string | null; message?: Record<string, unknown> }>
    usage?: { cached_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
  }
  const choice = obj.choices?.[0]
  const cached =
    obj.usage?.cached_tokens ??
    obj.usage?.prompt_tokens_details?.cached_tokens
  const assistantContent = extractAssistantText(json) || null
  return {
    finishReason: choice?.finish_reason ?? null,
    assistantContent,
    cachedTokens: cached,
  }
}

export async function chatRequest(options: ChatRequestOptions): Promise<ChatRequestResult> {
  const { config, body, stream = false, auth = 'default', signal } = options
  const timeoutMs = options.timeoutMs ?? config.timeoutMs
  const fetchSignal = requestSignal(signal, timeoutMs)
  const base = resolveBaseUrl(config)
  const url = `${base}/chat/completions`
  const started = performance.now()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (auth === 'default') {
    headers.Authorization = `Bearer ${config.apiKey}`
  } else if (auth === 'invalid') {
    headers.Authorization = `Bearer ${INVALID_KEY}`
  }
  if (stream) {
    headers.Accept = 'text/event-stream'
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        ...proxyRequestHeaders(config),
      },
      body: JSON.stringify(
        stream ? { stream: true, stream_options: { include_usage: true }, ...body } : body,
      ),
      signal: fetchSignal,
    })

    if (!stream) {
      const bodyText = await response.text()
      let json: unknown | null = null
      try {
        json = JSON.parse(bodyText)
      } catch {
        json = null
      }
      const httpOk = response.status >= 200 && response.status < 300
      return {
        httpStatus: response.status,
        bodyText,
        json,
        durationMs: performance.now() - started,
        sseLastChunkUsage: false,
        sseValid: false,
        error: httpOk ? undefined : formatProxyError(response.status, bodyText),
        ...extractResponseMeta(json),
      }
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      return {
        httpStatus: response.status,
        bodyText,
        json: null,
        durationMs: performance.now() - started,
        sseLastChunkUsage: false,
        sseValid: false,
        error: formatProxyError(response.status, bodyText),
      }
    }

    if (!response.body) {
      return {
        httpStatus: response.status,
        bodyText: '',
        json: null,
        durationMs: performance.now() - started,
        sseLastChunkUsage: false,
        sseValid: false,
        error: 'Empty stream body',
      }
    }

    let raw = ''
    let sseValid = true
    let sseLastChunkUsage = false
    let lastUsage = false

    for await (const chunk of parseSseStream(response.body)) {
      raw += chunk.raw + '\n'
      if (!chunk.raw.startsWith('data:')) sseValid = false
      const parsed = parseChunkJson(chunk.data)
      if (parsed.usage && (parsed.usage.prompt_tokens != null || parsed.usage.completion_tokens != null)) {
        lastUsage = true
      } else {
        lastUsage = false
      }
    }
    sseLastChunkUsage = lastUsage

    return {
      httpStatus: response.status,
      bodyText: raw.slice(0, 2000),
      json: null,
      durationMs: performance.now() - started,
      sseLastChunkUsage,
      sseValid: response.ok && sseValid,
      finishReason: null,
      assistantContent: null,
      cachedTokens: undefined,
    }
  } catch (err) {
    return {
      httpStatus: 0,
      bodyText: '',
      json: null,
      durationMs: performance.now() - started,
      sseLastChunkUsage: false,
      sseValid: false,
      error: err instanceof Error ? err.message : String(err),
      finishReason: null,
      assistantContent: null,
      cachedTokens: undefined,
    }
  }
}
