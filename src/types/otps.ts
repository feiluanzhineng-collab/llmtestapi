export type OtpsModelSize = 'gt10b' | 'lte10b'

export type OtpsSlaTierId = 'L1' | 'L2' | 'small'

export interface OtpsSlaTierDef {
  id: OtpsSlaTierId
  labelKey: string
  modelSize: OtpsModelSize
  minOtps: number
}

export interface OtpsRunPlan {
  modelSize: OtpsModelSize
  maxTokens: number
  concurrencyLevels: number[]
  /** 每个并发档位发送的请求数 */
  requestsPerLevel: number
  rpm: number
  tpm: number
}

export type OtpsRequestStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled'

export interface OtpsRequestLogEntry {
  id: string
  index: number
  concurrency: number
  seqInLevel: number
  status: OtpsRequestStatus
  ttftMs: number | null
  totalMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  otps: number | null
  httpStatus?: number
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface OtpsLevelStats {
  concurrency: number
  total: number
  success: number
  failed: number
  successRate: number
  otpsAvg: number | null
  otpsP50: number | null
  otpsP90: number | null
  indicativeOnly: boolean
  errors: string[]
}

export interface OtpsLevelResult {
  concurrency: number
  stats: OtpsLevelStats
}

export interface OtpsSlaResult {
  tierId: OtpsSlaTierId
  labelKey: string
  minOtps: number
  /** 采信并发档（成功率≥99% 的最高档） */
  sourceConcurrency: number | null
  measuredOtps: number | null
  pass: boolean | null
  indicativeOnly: boolean
  note: string
}

export interface OtpsRunReport {
  id: string
  startedAt: string
  finishedAt: string
  model: string
  baseUrl: string
  plan: OtpsRunPlan
  requests: OtpsRequestLogEntry[]
  levels: OtpsLevelResult[]
  slaResults: OtpsSlaResult[]
}
