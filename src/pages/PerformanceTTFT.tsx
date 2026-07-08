import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TTFT_TIERS, runTtftSuite, getTierDef, calcTotalRequests, calcRequestsPerTierPerRound } from '../core/ttft-runner'
import { msToSec } from '../core/metrics'
import { useConfigStore } from '../stores/config-store'
import type { TtftRequestLogEntry, TtftRequestMode, TtftRequestStatus, TtftRunPlan, TtftRunReport, TtftTierResult } from '../types'

function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  return `${msToSec(ms)}s`
}

function formatMsRaw(ms: number | null): string {
  if (ms == null) return '—'
  return `${Math.round(ms)}`
}

function formatOtps(v: number | null): string {
  if (v == null) return '—'
  return v.toFixed(1)
}

function StatusBadge({ pass, indicative }: { pass: boolean | null; indicative: boolean }) {
  const { t } = useTranslation()
  if (indicative) {
    return (
      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
        {t('ttft.successRateLow')}
      </span>
    )
  }
  if (pass === null) return <span className="text-slate-500">—</span>
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        pass ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      {pass ? t('ttft.tierPass') : t('ttft.tierFail')}
    </span>
  )
}

function RequestStatusCell({ status }: { status: TtftRequestStatus }) {
  const { t } = useTranslation()
  const styles: Record<TtftRequestStatus, string> = {
    pending: 'bg-slate-100 text-slate-600',
    running: 'bg-blue-50 text-blue-700',
    success: 'bg-emerald-50 text-emerald-700',
    error: 'bg-rose-50 text-rose-700',
    cancelled: 'bg-amber-50 text-amber-700',
  }
  const labels: Record<TtftRequestStatus, string> = {
    pending: t('ttft.statusPending'),
    running: t('ttft.statusRunning'),
    success: t('ttft.statusSuccess'),
    error: t('ttft.statusError'),
    cancelled: t('ttft.statusCancelled'),
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function RequestModeBadge({ mode }: { mode: TtftRequestMode }) {
  const { t } = useTranslation()
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
      {mode === 'stream' ? t('ttft.modeStream') : t('ttft.modeNonStream')}
    </span>
  )
}

function LiveRequestTable({ requests }: { requests: TtftRequestLogEntry[] }) {
  const { t } = useTranslation()
  if (requests.length === 0) return null

  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-surface-border shadow-sm">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-slate-600">
          <tr>
            <th className="px-2 py-2">{t('ttft.requestNo')}</th>
            <th className="px-2 py-2">{t('common.tier')}</th>
            <th className="px-2 py-2">{t('ttft.round')}</th>
            <th className="px-2 py-2">{t('ttft.seqInRound')}</th>
            <th className="px-2 py-2">{t('ttft.requestMode')}</th>
            <th className="px-2 py-2">{t('common.status')}</th>
            <th className="px-2 py-2">{t('ttft.ttftMs')}</th>
            <th className="px-2 py-2">{t('ttft.ttftSec')}</th>
            <th className="px-2 py-2">{t('ttft.totalLatency')}</th>
            <th className="px-2 py-2">{t('ttft.promptTokens')}</th>
            <th className="px-2 py-2">{t('ttft.completionTokens')}</th>
            <th className="px-2 py-2">{t('ttft.otps')}</th>
            <th className="px-2 py-2">{t('ttft.httpStatus')}</th>
            <th className="px-2 py-2">{t('common.errors')}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((row) => (
            <tr
              key={row.id}
              className={`border-t border-surface-border ${
                row.status === 'running' ? 'bg-blue-50/40' : ''
              }`}
            >
              <td className="px-2 py-2 font-mono text-slate-600">{row.index}</td>
              <td className="px-2 py-2 text-slate-800">{row.tierLabel}</td>
              <td className="px-2 py-2">{row.round}</td>
              <td className="px-2 py-2">{row.seqInRound}</td>
              <td className="px-2 py-2">
                <RequestModeBadge mode={row.requestMode} />
              </td>
              <td className="px-2 py-2">
                <RequestStatusCell status={row.status} />
              </td>
              <td className="px-2 py-2 font-mono text-accent">{formatMsRaw(row.ttftMs)}</td>
              <td className="px-2 py-2 font-mono">{formatMs(row.ttftMs)}</td>
              <td className="px-2 py-2 font-mono">{formatMs(row.totalMs)}</td>
              <td className="px-2 py-2 font-mono">
                {row.promptTokens ?? row.estimatedTokens}
              </td>
              <td className="px-2 py-2 font-mono">{row.completionTokens ?? '—'}</td>
              <td className="px-2 py-2 font-mono">{formatOtps(row.otps)}</td>
              <td className="px-2 py-2">{row.httpStatus ?? '—'}</td>
              <td className="max-w-[140px] truncate px-2 py-2 text-xs text-rose-600">
                {row.error ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TierSummaryTable({ tier, requestMode }: { tier: TtftTierResult; requestMode: TtftRequestMode }) {
  const { t } = useTranslation()
  const def = getTierDef(tier.tierId)
  const s = tier.stats
  const slaP90Sec = def?.sla.p90Sec

  const cell = (v: number | null, bold = false) => (
    <td className={`px-2 py-2 font-mono ${bold ? 'text-accent font-medium' : ''}`}>
      {formatMs(v)}
    </td>
  )

  return (
    <div className="space-y-3">
      {def && slaP90Sec != null && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-surface-border bg-slate-50 px-4 py-3 text-sm">
          <div>
            <span className="text-slate-500">{t('ttft.officialSla')}：</span>
            <span className="font-medium text-slate-800">
              {t('ttft.officialSlaP90', { sec: slaP90Sec })}
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t('ttft.measuredP90')}：</span>
            <span className="font-mono font-medium text-accent">
              {s.ttft.p90Ms != null
                ? t('ttft.measuredP90Value', { sec: msToSec(s.ttft.p90Ms) })
                : '—'}
            </span>
          </div>
          <StatusBadge pass={s.slaPass} indicative={s.indicativeOnly} />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-surface-border shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2" colSpan={4}>
                {t('ttft.requestStats')}
              </th>
              <th className="border-l border-surface-border px-2 py-2" colSpan={5}>
                {t('ttft.ttftMetrics')}
              </th>
              <th className="border-l border-surface-border px-2 py-2" colSpan={3}>
                {t('ttft.tokenMetrics')}
              </th>
              <th className="border-l border-surface-border px-2 py-2" colSpan={3}>
                {t('ttft.otpsMetrics')}
              </th>
            </tr>
            <tr className="text-xs">
              <th className="px-2 py-1">{t('ttft.totalRequests')}</th>
              <th className="px-2 py-1">{t('ttft.successCount')}</th>
              <th className="px-2 py-1">{t('ttft.failCount')}</th>
              <th className="px-2 py-1">{t('common.successRate')}</th>
              <th className="border-l border-surface-border px-2 py-1">{t('ttft.ttftMin')}</th>
              <th className="px-2 py-1">{t('ttft.p50')}</th>
              <th className="px-2 py-1">{t('ttft.p90')}</th>
              <th className="px-2 py-1">{t('ttft.avg')}</th>
              <th className="px-2 py-1">{t('ttft.ttftMax')}</th>
              <th className="border-l border-surface-border px-2 py-1">{t('ttft.promptTokens')}</th>
              <th className="px-2 py-1">{t('ttft.promptMinMax')}</th>
              <th className="px-2 py-1">{t('ttft.completionTokens')}</th>
              <th className="border-l border-surface-border px-2 py-1">{t('ttft.otpsAvg')}</th>
              <th className="px-2 py-1">{t('ttft.otpsP50')}</th>
              <th className="px-2 py-1">{t('ttft.otpsP90')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-surface-border">
              <td className="px-2 py-2">{s.total}</td>
              <td className="px-2 py-2 text-emerald-700">{s.success}</td>
              <td className="px-2 py-2 text-rose-600">{s.failed}</td>
              <td className="px-2 py-2">{(s.successRate * 100).toFixed(1)}%</td>
              {cell(s.ttft.minMs)}
              {cell(s.ttft.p50Ms)}
              {cell(s.ttft.p90Ms, true)}
              {cell(s.ttft.avgMs)}
              {cell(s.ttft.maxMs)}
              <td className="border-l border-surface-border px-2 py-2 font-mono">
                {s.promptTokensAvg != null ? Math.round(s.promptTokensAvg) : '—'}
              </td>
              <td className="px-2 py-2 font-mono text-xs">
                {s.promptTokensMin != null && s.promptTokensMax != null
                  ? `${s.promptTokensMin}–${s.promptTokensMax}`
                  : '—'}
              </td>
              <td className="px-2 py-2 font-mono">
                {s.completionTokensAvg != null ? Math.round(s.completionTokensAvg) : '—'}
              </td>
              <td className="border-l border-surface-border px-2 py-2 font-mono">
                {formatOtps(s.otpsAvg)}
              </td>
              <td className="px-2 py-2 font-mono">{formatOtps(s.otpsP50)}</td>
              <td className="px-2 py-2 font-mono">{formatOtps(s.otpsP90)}</td>
            </tr>
          </tbody>
        </table>
        <div className="border-t border-surface-border bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {requestMode === 'non-stream' ? t('ttft.slaNoteNonStream') : t('ttft.slaNote')}
          {def && (
            <>
              {' · '}
              {t('ttft.totalLatency')}: avg {formatMs(s.totalLatency.avgMs)}
              {' · '}
              P50&lt;{def.sla.p50Sec}s, avg&lt;{def.sla.avgSec}s ({t('ttft.slaCompare')})
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SlaReferenceTable() {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2">{t('ttft.inputTokens')}</th>
            <th className="px-3 py-2">{t('ttft.officialSla')}</th>
          </tr>
        </thead>
        <tbody>
          {TTFT_TIERS.map((tier) => (
            <tr key={tier.id} className="border-t border-surface-border">
              <td className="px-3 py-2 font-medium text-slate-800">{tier.labelKey}</td>
              <td className="px-3 py-2 font-mono">
                {t('ttft.officialSlaP90', { sec: tier.sla.p90Sec })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const DEFAULT_SELECTED = ['lt6k', '6to16k']

export function PerformanceTTFTPage() {
  const { t } = useTranslation()
  const config = useConfigStore((s) => s.config)

  const [rpm, setRpm] = useState(10)
  const [tpm, setTpm] = useState(0)
  const [durationMin, setDurationMin] = useState(1)
  const [rounds, setRounds] = useState(1)
  const [requestMode, setRequestMode] = useState<TtftRequestMode>('stream')
  const [selectedTierIds, setSelectedTierIds] = useState<string[]>(DEFAULT_SELECTED)

  const [running, setRunning] = useState(false)
  const [currentTier, setCurrentTier] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [liveRequests, setLiveRequests] = useState<TtftRequestLogEntry[]>([])
  const [report, setReport] = useState<TtftRunReport | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const toggleTier = (tierId: string) => {
    setSelectedTierIds((prev) =>
      prev.includes(tierId) ? prev.filter((id) => id !== tierId) : [...prev, tierId],
    )
  }

  const plan: TtftRunPlan = useMemo(
    () => ({ selectedTierIds, rounds, rpm, tpm, durationMin, requestMode }),
    [selectedTierIds, rounds, rpm, tpm, durationMin, requestMode],
  )

  const perTierRound = calcRequestsPerTierPerRound(rpm, durationMin)
  const totalRequestCount = calcTotalRequests(plan)

  const canRun = config.apiKey && config.model && selectedTierIds.length > 0 && rpm > 0

  const run = useCallback(async () => {
    if (!canRun) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)
    setReport(null)
    setLiveRequests([])
    setProgress({ done: 0, total: 0 })
    setCurrentTier(null)

    const requestMap = new Map<string, TtftRequestLogEntry>()

    try {
      const result = await runTtftSuite({
        config,
        plan,
        signal: ac.signal,
        onProgress: (ev) => {
          if (ev.type === 'run-start') {
            setProgress({ done: 0, total: ev.totalRequests })
          }
          if (ev.type === 'tier-start') setCurrentTier(ev.tierId)
          if (ev.type === 'request-update') {
            requestMap.set(ev.entry.id, ev.entry)
            setLiveRequests(Array.from(requestMap.values()).sort((a, b) => a.index - b.index))
            const done = Array.from(requestMap.values()).filter(
              (r) => r.status === 'success' || r.status === 'error' || r.status === 'cancelled',
            ).length
            setProgress((p) => ({ ...p, done }))
          }
          if (ev.type === 'complete') setReport(ev.report)
        },
      })
      setReport(result)
    } catch (err) {
      console.error(err)
    } finally {
      setRunning(false)
      setCurrentTier(null)
    }
  }, [canRun, config, plan])

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
    setCurrentTier(null)
  }

  const exportJson = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ttft-report-${report.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t('ttft.title')}</h2>
        <p className="mt-2 text-slate-600">{t('ttft.description')}</p>
      </div>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-900">{t('ttft.settings')}</h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">{t('ttft.rpm')}</span>
            <input
              type="number"
              min={1}
              value={rpm}
              onChange={(e) => setRpm(Number(e.target.value))}
              disabled={running}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 shadow-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('ttft.rpmHint')}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">{t('ttft.tpm')}</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={tpm}
              onChange={(e) => setTpm(Number(e.target.value))}
              disabled={running}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 shadow-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('ttft.tpmHint')}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">{t('ttft.durationMin')}</span>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              disabled={running}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 shadow-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('ttft.durationMinHint')}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">{t('common.rounds')}</span>
            <input
              type="number"
              min={1}
              max={20}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              disabled={running}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 shadow-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('ttft.roundsHint')}</span>
          </label>
        </div>

        {selectedTierIds.length > 0 && rpm > 0 && (
          <div className="mt-4 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{t('ttft.requestCount')}</p>
            <p className="mt-1">
              {t('ttft.requestCountFormula', {
                count: totalRequestCount,
                rpm,
                duration: durationMin,
                tiers: selectedTierIds.length,
                rounds,
              })}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t('ttft.requestsPerTierRound', { count: perTierRound })}
              {' · '}
              {t('ttft.requestCountHint')}
            </p>
          </div>
        )}

        <div className="mt-5">
          <span className="mb-2 block text-sm font-medium text-slate-700">{t('ttft.requestMode')}</span>
          <p className="mb-3 text-xs text-slate-500">{t('ttft.requestModeHint')}</p>
          <div className="flex flex-wrap gap-2">
            {(['stream', 'non-stream'] as const).map((mode) => (
              <label
                key={mode}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  requestMode === mode
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-surface-border bg-white text-slate-700 hover:border-slate-300'
                } ${running ? 'pointer-events-none opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="ttft-request-mode"
                  checked={requestMode === mode}
                  onChange={() => setRequestMode(mode)}
                  disabled={running}
                  className="border-surface-border"
                />
                {mode === 'stream' ? t('ttft.modeStream') : t('ttft.modeNonStream')}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-sm font-medium text-slate-700">{t('ttft.selectTiers')}</span>
          <p className="mb-3 text-xs text-slate-500">{t('ttft.selectTiersHint')}</p>
          <div className="flex flex-wrap gap-2">
            {TTFT_TIERS.map((tier) => {
              const checked = selectedTierIds.includes(tier.id)
              return (
                <label
                  key={tier.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    checked
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-surface-border bg-white text-slate-700 hover:border-slate-300'
                  } ${running ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTier(tier.id)}
                    disabled={running}
                    className="rounded border-surface-border"
                  />
                  <span>
                    {tier.labelKey}
                    <span className="ml-1 text-xs text-slate-500">
                      (~{tier.targetTokens.toLocaleString()})
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-sm font-medium text-slate-700">
            {t('ttft.slaReferenceTable')}
          </span>
          <SlaReferenceTable />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void run()}
              disabled={!canRun}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-muted disabled:opacity-40"
            >
              {t('ttft.runTest')}
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700"
            >
              {t('common.stop')}
            </button>
          )}
          {report && (
            <button
              type="button"
              onClick={exportJson}
              className="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {t('common.export')}
            </button>
          )}
          {!canRun && !running && rpm <= 0 && (
            <span className="text-sm text-amber-600">{t('ttft.rpmRequired')}</span>
          )}
          {!canRun && !running && selectedTierIds.length === 0 && (
            <span className="text-sm text-amber-600">{t('ttft.noTiersSelected')}</span>
          )}
        </div>

        {running && (
          <div className="mt-4 space-y-2">
            {currentTier && (
              <p className="text-sm text-accent">
                {t('ttft.runningTier', { tier: getTierDef(currentTier)?.labelKey ?? currentTier })}
              </p>
            )}
            {progress.total > 0 && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{t('ttft.progress', { done: progress.done, total: progress.total })}</span>
                  <span>{Math.round((progress.done / progress.total) * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {(running || liveRequests.length > 0) && (
        <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">{t('ttft.liveRequests')}</h3>
          <LiveRequestTable requests={liveRequests} />
        </section>
      )}

      <section className="space-y-6">
        <h3 className="font-semibold text-slate-900">{t('ttft.summary')}</h3>
        {!report && !running && (
          <p className="text-center text-slate-500">{t('ttft.noData')}</p>
        )}
        {(report?.tiers ?? []).map((tier) => {
          const def = getTierDef(tier.tierId)
          return (
            <div key={tier.tierId}>
              <h4 className="mb-2 font-medium text-slate-800">
                {def?.labelKey ?? tier.tierId}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  (~{tier.targetTokens.toLocaleString()} {t('ttft.promptTokens')})
                </span>
              </h4>
              <TierSummaryTable
                tier={tier}
                requestMode={report?.plan.requestMode ?? requestMode}
              />
            </div>
          )
        })}
      </section>
    </div>
  )
}
