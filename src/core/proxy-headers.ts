import type { AppConfig } from '../types/config'

export function isHostedDeploy(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'llmtest.feiluanai.com'
}

/** Extra headers when requests go through the same-origin /api/v1 relay. */
export function proxyRequestHeaders(config: AppConfig): Record<string, string> {
  if (!config.useProxy) return {}
  const base = config.baseUrl.trim().replace(/\/$/, '')
  if (!base) return {}
  return { 'X-LLM-Base-Url': base }
}

export function isLikelyCorsError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('cors') ||
    m.includes('access-control')
  )
}
