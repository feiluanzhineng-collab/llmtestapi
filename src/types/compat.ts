export type CompatStepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skip' | 'error'

export interface CompatExpect {
  status?: number | number[]
  statusNot?: number
  bodyIncludes?: string[]
  bodyExcludes?: string[]
  jsonValid?: boolean
  sseUsageInLastChunk?: boolean
  seedStable?: { runs: number }
}

export interface CompatStepDef {
  id: string
  label: string
  stream?: boolean
  body: Record<string, unknown> | 'build-long-input' | 'build-json-prompt'
  auth?: 'default' | 'none' | 'invalid'
  expect: CompatExpect
  skip?: boolean
  skipReason?: string
}

export interface CompatCaseDef {
  id: string
  subject: string
  testPoints: string
  risk: string
  steps: CompatStepDef[]
  optional?: boolean
}

export interface CompatStepResult {
  stepId: string
  label: string
  status: CompatStepStatus
  httpStatus: number
  durationMs: number
  message: string
  responsePreview: string
}

export interface CompatCaseResult {
  caseId: string
  subject: string
  status: CompatStepStatus
  steps: CompatStepResult[]
}

export interface CompatRunReport {
  id: string
  startedAt: string
  finishedAt: string
  model: string
  baseUrl: string
  cases: CompatCaseResult[]
  summary: { total: number; pass: number; fail: number; skip: number }
}
