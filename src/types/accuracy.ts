export type AccuracyQuestionStatus = 'pending' | 'running' | 'correct' | 'wrong' | 'error' | 'cancelled'

export interface AimeQuestion {
  id: number | string
  problem: string
  answer: number | string
}

export interface GpqaQuestion {
  id: string
  question: string
  options: string[]
  answer: string
  answer_index?: number
}

export interface SwePreviewItem {
  instance_id: string
  repo: string
  problem_statement: string
}

export interface AccuracyQuestionResult {
  id: string
  index: number
  status: AccuracyQuestionStatus
  modelAnswer?: string
  expected?: string
  correct?: boolean
  durationMs?: number
  error?: string
}

export interface AccuracyRunReport {
  id: string
  benchmarkId: string
  startedAt: string
  finishedAt: string
  model: string
  baseUrl: string
  total: number
  correct: number
  accuracyPct: number
  officialBaselinePct?: number
  diffPct?: number
  pass: boolean | null
  tolerancePct: number
  results: AccuracyQuestionResult[]
}
