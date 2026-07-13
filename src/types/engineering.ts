export type EngStepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skip' | 'error' | 'manual'

export interface EngExpect {
  status?: number | number[]
  statusNot?: number
  bodyIncludes?: string[]
  bodyExcludes?: string[]
  jsonValid?: boolean
  sseUsageInLastChunk?: boolean
  hasToolCalls?: boolean
  minToolCalls?: number
  hasReasoning?: boolean
  jsonSchemaKeys?: string[]
  /** 全部命中（AND） */
  contentIncludes?: string[]
  /** 至少命中其一（OR），用于多语言等同义断言 */
  contentIncludesAny?: string[]
}

export type EngStepHandler = 'eos-batch' | 'cache-compare' | 'json-repeat' | 'majority-repeat'

export interface EngStepDef {
  id: string
  label: string
  stream?: boolean
  body: Record<string, unknown>
  auth?: 'default' | 'none' | 'invalid'
  expect: EngExpect
  skip?: boolean
  skipReason?: string
  handler?: EngStepHandler
  handlerOptions?: {
    runs?: number
    repeatCount?: number
    minPassRate?: number
    /** majority-repeat：至少几次 evaluateEngStep 通过 */
    minPassCount?: number
  }
}

export interface EngCaseDef {
  id: string
  subject: string
  requirement: string
  mode: 'auto' | 'semi' | 'manual'
  steps: EngStepDef[]
  optional?: boolean
}

export interface EngStepResult {
  stepId: string
  label: string
  status: EngStepStatus
  httpStatus: number
  durationMs: number
  message: string
  responsePreview: string
}

export interface EngCaseResult {
  caseId: string
  subject: string
  status: EngStepStatus
  steps: EngStepResult[]
  manualNotes?: string
}

export interface EngManualOverride {
  status: 'pass' | 'fail' | 'na'
  notes: string
}

export interface EngRunReport {
  id: string
  startedAt: string
  finishedAt: string
  model: string
  baseUrl: string
  cases: EngCaseResult[]
  manualOverrides: Record<string, EngManualOverride>
  summary: { total: number; pass: number; fail: number; skip: number; manual: number }
}
