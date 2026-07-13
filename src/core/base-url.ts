/** 规范化并校验 Base URL（供同源代理 relay 使用） */

export interface BaseUrlIssue {
  level: 'error' | 'warn'
  message: string
}

export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim()
  if (!url) return url
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/+/, '')}`
  }
  return url.replace(/\/+$/, '')
}

export function validateBaseUrlForProxy(baseUrl: string): BaseUrlIssue[] {
  const issues: BaseUrlIssue[] = []
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) {
    issues.push({ level: 'error', message: '请填写接口地址 (Base URL)' })
    return issues
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    issues.push({ level: 'error', message: '接口地址格式无效' })
    return issues
  }

  if (parsed.protocol === 'http:') {
    issues.push({
      level: 'error',
      message: '同源代理仅允许 HTTPS（请将 http:// 改为 https://）',
    })
  } else if (parsed.protocol !== 'https:') {
    issues.push({ level: 'error', message: '接口地址须为 https:// 开头' })
  }

  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.endsWith('.local')
  ) {
    issues.push({
      level: 'error',
      message: '不能使用内网/本机地址（代理会拒绝转发）',
    })
  }

  if (!normalized.endsWith('/v1') && !normalized.includes('/v1/')) {
    issues.push({
      level: 'warn',
      message: '建议以 /v1 结尾，例如 https://ai.feiluanai.com/v1',
    })
  }

  return issues
}

/** 从代理 4xx 响应体提取可读错误 */
export function formatProxyError(httpStatus: number, bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { error?: string | { message?: string } }
    if (typeof j.error === 'string') {
      if (httpStatus === 403) {
        return `代理拒绝转发：${j.error}（请检查 Base URL 是否为 https 公网地址）`
      }
      if (httpStatus === 400 && j.error.includes('X-LLM-Base-Url')) {
        return '未携带目标地址：请勾选「经同源代理转发」并保存配置'
      }
      return j.error
    }
    if (j.error && typeof j.error === 'object' && j.error.message) {
      return j.error.message
    }
  } catch {
    // not JSON
  }
  if (httpStatus === 403) {
    if (!bodyText.trim()) {
      return '上游 API 返回 403（可能为 Key/模型权限或网关拦截，请检查 API Key 与账户状态）'
    }
    return '代理拒绝转发 (403)：请确认 Base URL 为 https 公网地址，且已勾选同源代理'
  }
  return bodyText.slice(0, 300) || `HTTP ${httpStatus}`
}
