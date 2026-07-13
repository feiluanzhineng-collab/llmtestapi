export type SuiteId =
  | 'dashboard'
  | 'engineering'
  | 'compatibility'
  | 'performance'
  | 'otps'
  | 'accuracy'
  | 'about'

export interface SuiteMeta {
  id: SuiteId
  available: boolean
}

export const SUITES: SuiteMeta[] = [
  { id: 'dashboard', available: true },
  { id: 'engineering', available: true },
  { id: 'compatibility', available: true },
  { id: 'performance', available: true },
  { id: 'otps', available: true },
  { id: 'accuracy', available: true },
]

export interface TtftSla {
  p50Sec: number
  p90Sec: number
  avgSec: number
}

export interface TtftTierDef {
  id: string
  labelKey: string
  targetTokens: number
  sla: TtftSla
  concurrencyLevels: number[]
}

export type TtftRequestMode = 'stream' | 'non-stream'

export interface TtftRunPlan {
  selectedTierIds: string[]
  /** 轮次：完整测试重复几遍（每遍遍历所有选中分档） */
  rounds: number
  /** 每分钟请求数，决定每档每轮发多少请求 */
  rpm: number
  /** 每分钟 token 上限，0 = 不限 */
  tpm: number
  /** 每档每轮持续时长（分钟），与 RPM 共同决定请求次数 */
  durationMin: number
  /** 流式（SSE 首 token）或非流式（整包响应） */
  requestMode: TtftRequestMode
}

export type TtftRequestStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled'

export interface LatencyStats {
  p50Ms: number | null
  p90Ms: number | null
  avgMs: number | null
  minMs: number | null
  maxMs: number | null
}

export interface TtftTierStats {
  total: number
  success: number
  failed: number
  successRate: number
  ttft: LatencyStats
  totalLatency: LatencyStats
  promptTokensAvg: number | null
  promptTokensMin: number | null
  promptTokensMax: number | null
  completionTokensAvg: number | null
  otpsAvg: number | null
  otpsP50: number | null
  otpsP90: number | null
  slaPass: boolean | null
  indicativeOnly: boolean
  errors: string[]
}

export interface TtftRequestLogEntry {
  id: string
  index: number
  tierId: string
  tierLabel: string
  requestMode: TtftRequestMode
  /** 第几轮（完整测试重复遍数） */
  round: number
  /** 该档该轮内第几次请求 */
  seqInRound: number
  status: TtftRequestStatus
  ttftMs: number | null
  totalMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  otps: number | null
  estimatedTokens: number
  httpStatus?: number
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface TtftConcurrencyResult {
  concurrency: number
  successRate: number
  samples: number
  p50Ms: number | null
  p90Ms: number | null
  avgMs: number | null
  slaPass: boolean | null
  indicativeOnly: boolean
  errors: string[]
}

export interface TtftTierResult {
  tierId: string
  targetTokens: number
  stats: TtftTierStats
  /** @deprecated kept for compat */
  concurrencyResults: TtftConcurrencyResult[]
  bestConcurrency: number | null
}

export interface TtftRunReport {
  id: string
  startedAt: string
  finishedAt: string
  model: string
  baseUrl: string
  plan: TtftRunPlan
  requests: TtftRequestLogEntry[]
  tiers: TtftTierResult[]
}
