export interface AppConfig {
  baseUrl: string
  apiKey: string
  model: string
  useProxy: boolean
  timeoutMs: number
}

export const DEFAULT_CONFIG: AppConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  useProxy: false,
  timeoutMs: 120_000,
}

export function resolveBaseUrl(config: AppConfig): string {
  if (config.useProxy) {
    return '/api/v1'
  }
  return config.baseUrl.replace(/\/$/, '')
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '***'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}
