import type { AccuracyRunReport } from '../types/accuracy'
import type { TestableBenchmarkId, LeaderboardRow } from '../data/model-leaderboard'
import { REFERENCE_LEADERBOARD } from '../data/model-leaderboard'

const STORAGE_KEY = 'llm-api-test-accuracy-runs'

export interface StoredAccuracyRun {
  model: string
  baseUrl: string
  benchmarkId: string
  accuracyPct: number
  total: number
  correct: number
  finishedAt: string
}

export function loadStoredRuns(): StoredAccuracyRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredAccuracyRun[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAccuracyRun(report: AccuracyRunReport): void {
  const runs = loadStoredRuns()
  runs.push({
    model: report.model,
    baseUrl: report.baseUrl,
    benchmarkId: report.benchmarkId,
    accuracyPct: report.accuracyPct,
    total: report.total,
    correct: report.correct,
    finishedAt: report.finishedAt,
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(-200)))
}

export function clearStoredRuns(): void {
  localStorage.removeItem(STORAGE_KEY)
}

function benchmarkToColumn(benchmarkId: string): TestableBenchmarkId | null {
  if (benchmarkId === 'aime2026') return 'aime2026'
  if (benchmarkId === 'gpqa-diamond') return 'gpqaDiamond'
  return null
}

/** 将本站历史跑分按模型聚合为排行榜行 */
export function buildOurLeaderboardRows(runs?: StoredAccuracyRun[]): LeaderboardRow[] {
  const list = runs ?? loadStoredRuns()
  const byModel = new Map<string, StoredAccuracyRun[]>()
  for (const r of list) {
    const key = `${r.model}|||${r.baseUrl}`
    const arr = byModel.get(key) ?? []
    arr.push(r)
    byModel.set(key, arr)
  }

  const rows: LeaderboardRow[] = []
  for (const [key, modelRuns] of byModel) {
    const [modelLabel] = key.split('|||')
    const scores: Partial<Record<TestableBenchmarkId, number | null>> = {}
    const sorted = [...modelRuns].sort(
      (a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime(),
    )
    for (const run of sorted) {
      const col = benchmarkToColumn(run.benchmarkId)
      if (col && scores[col] == null) {
        scores[col] = run.accuracyPct
      }
    }
    if (Object.keys(scores).length === 0) continue
    rows.push({
      id: `ours-${key}`,
      modelLabel,
      sourceKind: 'ours',
      sourceNoteKey: 'ourRuns',
      isOurs: true,
      scores,
    })
  }
  return rows.sort((a, b) => a.modelLabel.localeCompare(b.modelLabel))
}

export function getFullLeaderboard(runs?: StoredAccuracyRun[]): LeaderboardRow[] {
  return [...REFERENCE_LEADERBOARD, ...buildOurLeaderboardRows(runs)]
}
