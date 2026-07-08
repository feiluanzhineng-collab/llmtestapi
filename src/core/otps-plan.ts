import type { OtpsRunPlan } from '../types/otps'

export const DEFAULT_OTPS_CONCURRENCY = [1, 2, 4, 8]

export const OTPS_PROMPT =
  'Write a detailed technical explanation of how transformer-based language models generate text. Use multiple paragraphs and cover attention, training, and inference.'

export function calcOtpsTotalRequests(plan: Pick<OtpsRunPlan, 'concurrencyLevels' | 'requestsPerLevel'>): number {
  return plan.concurrencyLevels.length * plan.requestsPerLevel
}
