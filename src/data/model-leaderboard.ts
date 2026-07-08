/** 可本地实测的 benchmark（精度图表仅展示这两项） */
export type TestableBenchmarkId = 'aime2026' | 'gpqaDiamond'

/** 验收文档精度表列 ID（含不可本地跑的项，供存储映射） */
export type BenchmarkColumnId = TestableBenchmarkId | 'hle' | 'sweBenchPro' | 'tauBench'

export const CHART_BENCHMARKS: Array<{ id: TestableBenchmarkId; docName: string }> = [
  { id: 'aime2026', docName: 'AIME2026' },
  { id: 'gpqaDiamond', docName: 'GPQA-Diamond' },
]

export type LeaderboardSourceKind = 'official' | 'doc' | 'public' | 'ours'

export interface LeaderboardRow {
  id: string
  modelLabel: string
  sourceKind: LeaderboardSourceKind
  /** i18n key under accuracy.leaderboard.sources */
  sourceNoteKey?: string
  isOurs?: boolean
  scores: Partial<Record<TestableBenchmarkId, number | null>>
}

/**
 * 市面常见模型参考跑分（仅 AIME2026 / GPQA-Diamond）
 * 公开参考分主要来自 BenchLM.ai 2026-07；GLM-5.1 官方/文档样例来自验收文档。
 * 不同评测 harness 不可直接横比。
 */
export const REFERENCE_LEADERBOARD: LeaderboardRow[] = [
  {
    id: 'glm51-official',
    modelLabel: 'GLM-5.1',
    sourceKind: 'official',
    sourceNoteKey: 'vendorOfficial',
    scores: { aime2026: 95.3, gpqaDiamond: 86.2 },
  },
  {
    id: 'glm51-doc-sample',
    modelLabel: 'GLM-5.1',
    sourceKind: 'doc',
    sourceNoteKey: 'docSupplierSample',
    scores: { aime2026: 93.8, gpqaDiamond: 85.1 },
  },
  {
    id: 'glm-52',
    modelLabel: 'GLM-5.2',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 99.2, gpqaDiamond: null },
  },
  {
    id: 'kimi-k26',
    modelLabel: 'Kimi K2.6',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 96.4, gpqaDiamond: null },
  },
  {
    id: 'gpt-56-ultra',
    modelLabel: 'GPT-5.6 Ultra',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 99.0, gpqaDiamond: 95.2 },
  },
  {
    id: 'gemini-31-pro',
    modelLabel: 'Gemini 3.1 Pro',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 94.0, gpqaDiamond: 94.3 },
  },
  {
    id: 'claude-opus-47',
    modelLabel: 'Claude Opus 4.7',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 90.0, gpqaDiamond: 94.2 },
  },
  {
    id: 'claude-opus-48',
    modelLabel: 'Claude Opus 4.8',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 98.3, gpqaDiamond: 93.6 },
  },
  {
    id: 'gpt-55',
    modelLabel: 'GPT-5.5',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 95.2, gpqaDiamond: 93.6 },
  },
  {
    id: 'gpt-54',
    modelLabel: 'GPT-5.4',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 94.5, gpqaDiamond: 92.8 },
  },
  {
    id: 'qwen37-max',
    modelLabel: 'Qwen3.7 Max',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 93.3, gpqaDiamond: 92.4 },
  },
  {
    id: 'deepseek-v4',
    modelLabel: 'DeepSeek V4',
    sourceKind: 'public',
    sourceNoteKey: 'publicRef',
    scores: { aime2026: 88.5, gpqaDiamond: 90.1 },
  },
]

export interface ChartEntry {
  id: string
  modelLabel: string
  score: number
  sourceKind: LeaderboardSourceKind
  sourceNoteKey?: string
  isOurs?: boolean
  isCurrent?: boolean
}

const BAR_COLORS: Record<LeaderboardSourceKind, string> = {
  official: '#7c3aed',
  doc: '#2563eb',
  public: '#94a3b8',
  ours: '#059669',
}

export function getBarColor(kind: LeaderboardSourceKind, isCurrent?: boolean): string {
  if (isCurrent) return '#0d9488'
  return BAR_COLORS[kind]
}

/** 按 benchmark 提取有分数的条目，按分数降序 */
export function getChartEntries(
  rows: LeaderboardRow[],
  benchmarkId: TestableBenchmarkId,
  currentModel?: string,
): ChartEntry[] {
  const entries: ChartEntry[] = []
  for (const row of rows) {
    const score = row.scores[benchmarkId]
    if (score == null) continue
    const isCurrent = Boolean(row.isOurs && currentModel && row.modelLabel === currentModel)
    entries.push({
      id: row.id,
      modelLabel: row.modelLabel,
      score,
      sourceKind: row.sourceKind,
      sourceNoteKey: row.sourceNoteKey,
      isOurs: row.isOurs,
      isCurrent,
    })
  }
  return entries.sort((a, b) => b.score - a.score)
}
