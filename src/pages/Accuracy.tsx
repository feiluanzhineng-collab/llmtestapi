import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccuracyLeaderboardChart } from '../components/accuracy/LeaderboardChart'
import {
  clearStoredRuns,
  getFullLeaderboard,
  loadStoredRuns,
  saveAccuracyRun,
} from '../core/accuracy-storage'
import { loadSwePreview, runAccuracyBenchmark } from '../core/accuracy-runner'
import { BENCHMARK_CATALOG, type BenchmarkMeta } from '../data/benchmark-meta'
import { useConfigStore } from '../stores/config-store'
import type { AccuracyQuestionResult, AccuracyRunReport } from '../types/accuracy'

function RunModeBadge({ mode }: { mode: BenchmarkMeta['runMode'] }) {
  const { t } = useTranslation()
  const styles = {
    auto: 'bg-emerald-50 text-emerald-700',
    preview: 'bg-amber-50 text-amber-700',
    manual: 'bg-slate-100 text-slate-600',
  }
  const labels = {
    auto: t('accuracy.modeAuto'),
    preview: t('accuracy.modePreview'),
    manual: t('accuracy.modeManual'),
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[mode]}`}>
      {labels[mode]}
    </span>
  )
}

function BenchmarkCard({
  meta,
  onRun,
  running,
}: {
  meta: BenchmarkMeta
  onRun?: (id: string) => void
  running: boolean
}) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<string[] | null>(null)

  const loadPreview = async () => {
    if (meta.id !== 'swe-bench-pro') return
    const items = await loadSwePreview(3)
    setPreview(items.map((x) => `[${x.repo}] ${x.problem_statement.slice(0, 120)}…`))
  }

  return (
    <div className="rounded-xl border border-surface-border bg-white p-5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-900">{meta.docName}</h4>
        <RunModeBadge mode={meta.runMode} />
      </div>
      <p className="mb-2 text-sm text-slate-600">{t(`accuracy.datasets.${meta.descriptionKey}.desc`)}</p>
      <p className="mb-3 text-xs text-slate-500">{t(`accuracy.datasets.${meta.descriptionKey}.why`)}</p>

      <dl className="mb-4 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
        <div>
          <dt className="inline text-slate-500">{t('accuracy.ability')}：</dt>
          <dd className="inline">{t(`accuracy.abilities.${meta.abilityKey}`)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">{t('accuracy.questionCount')}：</dt>
          <dd className="inline">{meta.questionCount || '—'}</dd>
        </div>
        {meta.localFile && (
          <div className="sm:col-span-2">
            <dt className="inline text-slate-500">{t('accuracy.localFile')}：</dt>
            <dd className="inline font-mono">
              {meta.localFile} ({meta.fileSizeHint})
            </dd>
          </div>
        )}
        {meta.officialBaselinePct != null && (
          <div>
            <dt className="inline text-slate-500">{t('accuracy.officialBaseline')}：</dt>
            <dd className="inline font-mono">{meta.officialBaselinePct}%</dd>
          </div>
        )}
        <div>
          <dt className="inline text-slate-500">{t('accuracy.source')}：</dt>
          <dd className="inline">
            <a
              href={meta.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {t('accuracy.viewSource')}
            </a>
          </dd>
        </div>
      </dl>

      {meta.runMode === 'auto' && onRun && (
        <button
          type="button"
          disabled={running}
          onClick={() => onRun(meta.id)}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-muted disabled:opacity-40"
        >
          {t('accuracy.runBenchmark')}
        </button>
      )}
      {meta.runMode === 'preview' && (
        <button
          type="button"
          onClick={() => void loadPreview()}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-slate-700"
        >
          {t('accuracy.previewProblems')}
        </button>
      )}
      {meta.runMode === 'manual' && (
        <p className="text-xs text-amber-700">{t('accuracy.manualHint')}</p>
      )}
      {preview && (
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-slate-600">
          {preview.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ResultRow({ r }: { r: AccuracyQuestionResult }) {
  const { t } = useTranslation()
  const colors: Record<AccuracyQuestionResult['status'], string> = {
    pending: 'text-slate-500',
    running: 'text-blue-600',
    correct: 'text-emerald-700',
    wrong: 'text-rose-600',
    error: 'text-rose-600',
    cancelled: 'text-amber-600',
  }
  return (
    <tr className="border-t border-surface-border text-sm">
      <td className="px-2 py-2">{r.index}</td>
      <td className={`px-2 py-2 ${colors[r.status]}`}>{t(`accuracy.status.${r.status}`)}</td>
      <td className="max-w-[120px] truncate px-2 py-2 font-mono text-xs">{r.expected ?? '—'}</td>
      <td className="max-w-[200px] truncate px-2 py-2 text-xs" title={r.error ?? r.modelAnswer}>
        {r.status === 'error' && r.error ? r.error : (r.modelAnswer ?? '—')}
      </td>
      <td className="px-2 py-2">{r.durationMs ? `${r.durationMs}ms` : '—'}</td>
    </tr>
  )
}

export function AccuracyPage() {
  const { t } = useTranslation()
  const config = useConfigStore((s) => s.config)
  const [limit, setLimit] = useState(5)
  const [running, setRunning] = useState(false)
  const [activeBench, setActiveBench] = useState<string | null>(null)
  const [liveResults, setLiveResults] = useState<AccuracyQuestionResult[]>([])
  const [report, setReport] = useState<AccuracyRunReport | null>(null)
  const [storedRuns, setStoredRuns] = useState(() => loadStoredRuns())
  const abortRef = useRef<AbortController | null>(null)

  const leaderboardRows = useMemo(
    () => getFullLeaderboard(storedRuns),
    [storedRuns],
  )

  const runBenchmark = useCallback(
    async (benchmarkId: string) => {
      if (!config.apiKey || !config.model) return
      if (benchmarkId !== 'aime2026' && benchmarkId !== 'gpqa-diamond') return

      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setRunning(true)
      setActiveBench(benchmarkId)
      setReport(null)
      setLiveResults([])

      try {
        const result = await runAccuracyBenchmark({
          config,
          benchmarkId,
          limit: limit > 0 ? limit : undefined,
          signal: ac.signal,
          onProgress: (r, done, total) => {
            setLiveResults((prev) => {
              const next = [...prev.filter((x) => x.id !== r.id), r]
              return next.sort((a, b) => a.index - b.index)
            })
            if (done === total) setReport(null)
          },
        })
        setReport(result)
        saveAccuracyRun(result)
        setStoredRuns(loadStoredRuns())
      } finally {
        setRunning(false)
        setActiveBench(null)
      }
    },
    [config, limit],
  )

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  const displayResults = report?.results ?? liveResults

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t('accuracy.title')}</h2>
        <p className="mt-2 text-slate-600">{t('accuracy.description')}</p>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-5">
        <h3 className="mb-2 font-semibold text-amber-950">{t('accuracy.limitationsTitle')}</h3>
        <p className="text-sm text-amber-900">{t('accuracy.limitationsBody')}</p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-amber-900/90">
          <li>{t('accuracy.limitationsAime')}</li>
          <li>{t('accuracy.limitationsGpqa')}</li>
          <li>{t('accuracy.limitationsHarness')}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">{t('accuracy.leaderboard.title')}</h3>
          {storedRuns.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearStoredRuns()
                setStoredRuns([])
              }}
              className="text-xs text-slate-500 hover:text-rose-600"
            >
              {t('accuracy.leaderboard.clearOurs')}
            </button>
          )}
        </div>
        <p className="text-sm text-slate-600">{t('accuracy.leaderboard.subtitle')}</p>
        <AccuracyLeaderboardChart rows={leaderboardRows} currentModel={config.model} />
      </section>

      <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-5">
        <h3 className="mb-2 font-semibold text-slate-900">{t('accuracy.localRunTitle')}</h3>
        <p className="text-sm text-slate-700">{t('accuracy.localRunBody')}</p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-600">
          <li>{t('accuracy.localRunAime')}</li>
          <li>{t('accuracy.localRunGpqa')}</li>
          <li>{t('accuracy.localRunSwe')}</li>
        </ul>
      </section>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-900">{t('accuracy.runSettings')}</h3>
        <label className="block text-sm text-slate-700">
          {t('accuracy.questionLimit')}
          <input
            type="number"
            min={0}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Math.max(0, Number(e.target.value) || 0))}
            disabled={running}
            className="ml-2 w-24 rounded border border-surface-border px-2 py-1"
          />
          <span className="ml-2 text-xs text-slate-500">{t('accuracy.questionLimitHint')}</span>
        </label>
        {running && (
          <button
            type="button"
            onClick={stop}
            className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700"
          >
            {t('common.stop')}
          </button>
        )}
        {activeBench && (
          <p className="mt-2 text-sm text-blue-700">
            {t('accuracy.running', { name: activeBench })}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-semibold text-slate-900">{t('accuracy.datasetsTitle')}</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {BENCHMARK_CATALOG.map((meta) => (
            <BenchmarkCard
              key={meta.id}
              meta={meta}
              running={running}
              onRun={
                meta.runMode === 'auto'
                  ? (id) => void runBenchmark(id)
                  : undefined
              }
            />
          ))}
        </div>
      </section>

      {report && (
        <section className="rounded-xl border border-surface-border bg-slate-50 p-5">
          <h3 className="mb-3 font-semibold text-slate-900">{t('accuracy.summary')}</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              {t('accuracy.accuracy')}: <strong className="font-mono">{report.accuracyPct.toFixed(1)}%</strong>
            </span>
            <span>
              {t('accuracy.correct')}: {report.correct}/{report.total}
            </span>
            {report.officialBaselinePct != null && (
              <>
                <span>
                  {t('accuracy.officialBaseline')}: {report.officialBaselinePct}%
                </span>
                <span>
                  Diff:{' '}
                  <strong className="font-mono">
                    {report.diffPct != null ? `${report.diffPct >= 0 ? '+' : ''}${report.diffPct.toFixed(1)}%` : '—'}
                  </strong>
                </span>
                <span>
                  {report.pass === true && (
                    <span className="text-emerald-700">{t('accuracy.withinTolerance')}</span>
                  )}
                  {report.pass === false && (
                    <span className="text-rose-600">{t('accuracy.outsideTolerance')}</span>
                  )}
                </span>
              </>
            )}
          </div>
        </section>
      )}

      {displayResults.length > 0 && (
        <section>
          <h3 className="mb-3 font-semibold text-slate-900">{t('accuracy.liveResults')}</h3>
          <div className="max-h-80 overflow-auto rounded-lg border border-surface-border">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">{t('common.status')}</th>
                  <th className="px-2 py-2">{t('accuracy.expected')}</th>
                  <th className="px-2 py-2">{t('accuracy.modelAnswer')}</th>
                  <th className="px-2 py-2">{t('common.duration')}</th>
                </tr>
              </thead>
              <tbody>
                {displayResults.map((r) => (
                  <ResultRow key={`${r.id}-${r.index}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 text-sm text-slate-600">
        <h3 className="mb-2 font-semibold text-slate-800">{t('accuracy.toleranceNote')}</h3>
        <p>{t('accuracy.toleranceNoteBody')}</p>
      </section>
    </div>
  )
}
