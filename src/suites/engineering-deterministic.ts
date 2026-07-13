/** 行为类用例默认复验次数（temperature=0 + seed 下应稳定，三次全过视为确定性通过） */
export const ENG_BEHAVIOR_VERIFY_RUNS = 3

/** 结构化输出合规采样次数（固定参数下应 100% 合法） */
export const ENG_JSON_VERIFY_RUNS = 5

const TEMP_ZERO = { temperature: 0, seed: 42 } as const
const SEED_ONLY = { seed: 42 } as const

/** 为工程性 auto 用例注入确定性采样参数；thinking 开启时不覆盖 temperature */
export function detBody(body: Record<string, unknown>): Record<string, unknown> {
  const thinking = body.thinking as { type?: string } | undefined
  const base = thinking?.type === 'enabled' ? SEED_ONLY : TEMP_ZERO
  return { ...base, ...body }
}
