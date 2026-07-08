import type { OtpsModelSize, OtpsSlaTierDef, OtpsSlaTierId } from '../types/otps'

export const OTPS_SLA_TIERS: OtpsSlaTierDef[] = [
  { id: 'L1', labelKey: 'L1', modelSize: 'gt10b', minOtps: 30 },
  { id: 'L2', labelKey: 'L2', modelSize: 'gt10b', minOtps: 10 },
  { id: 'small', labelKey: '≤10B', modelSize: 'lte10b', minOtps: 100 },
]

export function slaTiersForModelSize(modelSize: OtpsModelSize): OtpsSlaTierDef[] {
  return OTPS_SLA_TIERS.filter((t) => t.modelSize === modelSize)
}

export function getOtpsSlaTier(id: OtpsSlaTierId): OtpsSlaTierDef | undefined {
  return OTPS_SLA_TIERS.find((t) => t.id === id)
}
