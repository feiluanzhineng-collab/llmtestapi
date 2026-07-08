import { useTranslation } from 'react-i18next'
import {
  CHART_BENCHMARKS,
  type ChartEntry,
  type LeaderboardRow,
  type LeaderboardSourceKind,
  type TestableBenchmarkId,
  getBarColor,
  getChartEntries,
} from '../../data/model-leaderboard'

const SOURCE_LEGEND: LeaderboardSourceKind[] = ['official', 'doc', 'public', 'ours']

function SourceLegend() {
  const { t } = useTranslation()
  const dotColors: Record<LeaderboardSourceKind, string> = {
    official: 'bg-violet-500',
    doc: 'bg-blue-500',
    public: 'bg-slate-400',
    ours: 'bg-emerald-500',
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
      {SOURCE_LEGEND.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${dotColors[kind]}`} />
          {t(`accuracy.leaderboard.sources.${kind}`)}
        </span>
      ))}
    </div>
  )
}

function BarRow({ entry, maxScore }: { entry: ChartEntry; maxScore: number }) {
  const { t } = useTranslation()
  const widthPct = Math.max(2, (entry.score / maxScore) * 100)
  const color = getBarColor(entry.sourceKind, entry.isCurrent)
  const sourceLabel = entry.sourceNoteKey
    ? t(`accuracy.leaderboard.sources.${entry.sourceNoteKey}`)
    : t(`accuracy.leaderboard.sources.${entry.sourceKind}`)

  return (
    <div className="space-y-1">
      <div className="min-w-0">
        <div
          className={`truncate text-xs font-medium sm:text-sm ${
            entry.isOurs ? 'text-emerald-800' : 'text-slate-800'
          }`}
          title={entry.modelLabel}
        >
          {entry.modelLabel}
          {entry.isCurrent && (
            <span className="ml-1 text-[10px] font-normal text-teal-600">
              ({t('accuracy.leaderboard.current')})
            </span>
          )}
        </div>
        {!entry.isOurs && (
          <div className="truncate text-[10px] text-slate-400">{sourceLabel}</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative h-5 min-w-0 flex-1">
          <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-slate-100" />
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{ width: `${widthPct}%`, backgroundColor: color }}
          />
        </div>
        <span className="w-12 shrink-0 text-right font-mono text-xs font-medium text-slate-700">
          {entry.score.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

function BenchmarkChart({
  benchmarkId,
  title,
  rows,
  currentModel,
}: {
  benchmarkId: TestableBenchmarkId
  title: string
  rows: LeaderboardRow[]
  currentModel?: string
}) {
  const { t } = useTranslation()
  const entries = getChartEntries(rows, benchmarkId, currentModel)

  const maxScore = entries.length > 0 ? Math.max(100, ...entries.map((e) => e.score)) : 100

  return (
    <div className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">{t('accuracy.leaderboard.noData')}</p>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry) => (
            <BarRow key={entry.id} entry={entry} maxScore={maxScore} />
          ))}
        </div>
      )}
    </div>
  )
}

export function AccuracyLeaderboardChart({
  rows,
  currentModel,
}: {
  rows: LeaderboardRow[]
  currentModel?: string
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <SourceLegend />
      <div className="grid gap-4 lg:grid-cols-2">
        {CHART_BENCHMARKS.map((col) => (
          <BenchmarkChart
            key={col.id}
            benchmarkId={col.id}
            title={col.docName}
            rows={rows}
            currentModel={currentModel}
          />
        ))}
      </div>
      <p className="text-xs text-slate-500">{t('accuracy.leaderboard.disclaimer')}</p>
    </div>
  )
}
