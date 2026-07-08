import type { TtftRunPlan } from '../types'

/** Requests sent per tier per round: RPM × duration (minutes). */
export function calcRequestsPerTierPerRound(rpm: number, durationMin: number): number {
  if (rpm <= 0) return 0
  return Math.max(1, Math.round(rpm * durationMin))
}

export function calcTotalRequests(plan: Pick<TtftRunPlan, 'selectedTierIds' | 'rounds' | 'rpm' | 'durationMin'>): number {
  const perTier = calcRequestsPerTierPerRound(plan.rpm, plan.durationMin)
  return plan.selectedTierIds.length * plan.rounds * perTier
}
