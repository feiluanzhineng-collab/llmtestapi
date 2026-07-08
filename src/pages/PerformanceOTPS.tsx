import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadOtpsExcel } from '../core/export-otps-excel'
import {
  calcOtpsTotalRequests,
  DEFAULT_OTPS_CONCURRENCY,
} from '../core/otps-plan'
import { OTPS_SLA_TIERS } from '../core/otps-sla'
import { runOtpsSuite } from '../core/otps-runner'
import { useConfigStore } from '../stores/config-store'
import type {
  OtpsLevelResult,
  OtpsModelSize,
  OtpsRequestLogEntry,
  OtpsRequestStatus,
  OtpsRunPlan,
  OtpsRunReport,
} from '../types/otps'

function formatOtps(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}`
}

function RequestStatusCell({ status }: { status: OtpsRequestStatus }) {
  const { t } = useTranslation()
  const styles: Record<OtpsRequestStatus, string> = {
    pending: 'bg-slate-100 text-slate-600',
    running: 'bg-blue-50 text-blue-700',
    success: 'bg-emerald-50 text-emerald-700',
    error: 'bg-rose-50 text-rose-700',
    cancelled: 'bg-amber-50 text-amber-700',
  }
  const labels: Record<OtpsRequestStatus, string> = {
    pending: t('otps.statusPending'),
    running: t('otps.statusRunning'),
    success: t('otps.statusSuccess'),
    error: t('otps.statusError'),
    cancelled: t('otps.statusCancelled'),
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function SlaPassBadge({ pass, indicative }: { pass: boolean | null; indicative: boolean }) {
  const { t } = useTranslation()
  if (indicative) {
    return (
      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
        {t('otps.indicativeOnly')}
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
      {pass ? t('otps.slaPass') : t('otps.slaFail')}
    </span>
  )
}

function LiveRequestTable({ requests }: { requests: OtpsRequestLogEntry[] }) {
  const { t } = useTranslation()
  if (requests.length === 0) return null

  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-surface-border shadow-sm">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-slate-600">
          <tr>
            <th className="px-2 py-2">{t('otps.requestNo')}</th>
            <th className="px-2 py-2">{t('common.concurrency')}</th>
            <th className="px-2 py-2">{t('otps.seqInLevel')}</th>
            <th className="px-2 py-2">{t('common.status')}</th>
            <th className="px-2 py-2">{t('otps.otps')}</th>
            <th className="px-2 py-2">{t('otps.completionTokens')}</th>
            <th className="px-2 py-2">{t('common.duration')}</th>
            <th className="px-2 py-2">TTFT</th>
            <th className="px-2 py-2">HTTP</th>
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
              <td className="px-2 py-2 font-mono">{row.index}</td>
              <td className="px-2 py-2">{row.concurrency}</td>
              <td className="px-2 py-2">{row.seqInLevel}</td>
              <td className="px-2 py-2">
                <RequestStatusCell status={row.status} />
              </td>
              <td className="px-2 py-2 font-mono text-accent">{formatOtps(row.otps)}</td>
              <td className="px-2 py-2 font-mono">{row.completionTokens ?? '—'}</td>
              <td className="px-2 py-2 font-mono">
                {row.totalMs != null ? `${Math.round(row.totalMs)}ms` : '—'}
              </td>
              <td className="px-2 py-2 font-mono">
                {row.ttftMs != null ? `${Math.round(row.ttftMs)}ms` : '—'}
              </td>
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

function LevelSummaryTable({ levels }: { levels: OtpsLevelResult[] }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2">{t('common.concurrency')}</th>
            <th className="px-3 py-2">{t('otps.totalRequests')}</th>
            <th className="px-3 py-2">{t('otps.successCount')}</th>
            <th className="px-3 py-2">{t('common.successRate')}</th>
            <th className="px-3 py-2">{t('otps.otpsP50')}</th>
            <th className="px-3 py-2">{t('otps.otpsP90')}</th>
            <th className="px-3 py-2">{t('otps.otpsAvg')}</th>
            <th className="px-3 py-2">{t('otps.credibility')}</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((level) => {
            const s = level.stats
            return (
              <tr key={level.concurrency} className="border-t border-surface-border">
                <td className="px-3 py-2 font-medium">{level.concurrency}</td>
                <td className="px-3 py-2">{s.total}</td>
                <td className="px-3 py-2 text-emerald-700">{s.success}</td>
                <td className="px-3 py-2">{(s.successRate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2 font-mono text-accent">{formatOtps(s.otpsP50)}</td>
                <td className="px-3 py-2 font-mono">{formatOtps(s.otpsP90)}</td>
                <td className="px-3 py-2 font-mono">{formatOtps(s.otpsAvg)}</td>
                <td className="px-3 py-2">
                  {s.indicativeOnly ? (
                    <span className="text-xs text-amber-700">{t('otps.indicativeOnly')}</span>
                  ) : (
                    <span className="text-xs text-emerald-700">{t('otps.credible')}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SlaResultTable({ report }: { report: OtpsRunReport }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2">{t('otps.modelSize')}</th>
            <th className="px-3 py-2">{t('otps.tier')}</th>
            <th className="px-3 py-2">{t('otps.officialSla')}</th>
            <th className="px-3 py-2">{t('otps.measured')}</th>
            <th className="px-3 py-2">{t('otps.slaCompare')}</th>
            <th className="px-3 py-2">{t('common.notes')}</th>
          </tr>
        </thead>
        <tbody>
          {report.slaResults.map((sla) => (
            <tr key={sla.tierId} className="border-t border-surface-border">
              <td className="px-3 py-2">
                {report.plan.modelSize === 'gt10b' ? '>10B' : '≤10B'}
              </td>
              <td className="px-3 py-2 font-medium">{sla.labelKey}</td>
              <td className="px-3 py-2 font-mono">≥ {sla.minOtps}</td>
              <td className="px-3 py-2 font-mono text-accent">
                {sla.measuredOtps != null ? `${sla.measuredOtps.toFixed(1)}` : 'N/A'}
              </td>
              <td className="px-3 py-2">
                <SlaPassBadge pass={sla.pass} indicative={sla.indicativeOnly} />
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">{sla.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
            <th className="px-3 py-2">{t('otps.modelSize')}</th>
            <th className="px-3 py-2">{t('otps.tier')}</th>
            <th className="px-3 py-2">{t('otps.officialSla')}</th>
          </tr>
        </thead>
        <tbody>
          {OTPS_SLA_TIERS.map((tier) => (
            <tr key={tier.id} className="border-t border-surface-border">
              <td className="px-3 py-2">
                {tier.modelSize === 'gt10b' ? '>10B' : '≤10B'}
              </td>
              <td className="px-3 py-2 font-medium">{tier.labelKey}</td>
              <td className="px-3 py-2 font-mono">≥ {tier.minOtps} tokens/s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PerformanceOTPSPage() {
  const { t } = useTranslation()
  const config = useConfigStore((s) => s.config)

  const [modelSize, setModelSize] = useState<OtpsModelSize>('gt10b')
  const [maxTokens, setMaxTokens] = useState(1024)
  const [rpm, setRpm] = useState(10)
  const [tpm, setTpm] = useState(0)
  const [requestsPerLevel, setRequestsPerLevel] = useState(5)
  const [concurrencyLevels, setConcurrencyLevels] = useState<number[]>(DEFAULT_OTPS_CONCURRENCY)

  const [running, setRunning] = useState(false)
  const [currentConcurrency, setCurrentConcurrency] = useState<number | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [liveRequests, setLiveRequests] = useState<OtpsRequestLogEntry[]>([])
  const [report, setReport] = useState<OtpsRunReport | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const toggleConcurrency = (c: number) => {
    setConcurrencyLevels((prev) => {
      const next = prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c].sort((a, b) => a - b)
      return next.length ? next : prev
    })
  }

  const plan: OtpsRunPlan = useMemo(
    () => ({ modelSize, maxTokens, concurrencyLevels, requestsPerLevel, rpm, tpm }),
    [modelSize, maxTokens, concurrencyLevels, requestsPerLevel, rpm, tpm],
  )

  const totalRequestCount = calcOtpsTotalRequests(plan)
  const canRun =
    config.apiKey && config.model && concurrencyLevels.length > 0 && requestsPerLevel > 0 && rpm > 0

  const run = useCallback(async () => {
    if (!canRun) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)
    setReport(null)
    setLiveRequests([])
    setProgress({ done: 0, total: 0 })
    setCurrentConcurrency(null)

    const requestMap = new Map<string, OtpsRequestLogEntry>()

    try {
      await runOtpsSuite({
        config,
        plan,
        signal: ac.signal,
        onProgress: (ev) => {
          if (ev.type === 'run-start') {
            setProgress({ done: 0, total: ev.totalRequests })
          }
          if (ev.type === 'level-start') {
            setCurrentConcurrency(ev.concurrency)
          }
          if (ev.type === 'request-update') {
            requestMap.set(ev.entry.id, ev.entry)
            setLiveRequests(
              Array.from(requestMap.values()).sort((a, b) => a.index - b.index),
            )
            const done = Array.from(requestMap.values()).filter(
              (r) => r.status !== 'pending' && r.status !== 'running',
            ).length
            setProgress((p) => ({ ...p, done }))
          }
          if (ev.type === 'complete') {
            setReport(ev.report)
            setCurrentConcurrency(null)
          }
        },
      })
    } finally {
      setRunning(false)
    }
  }, [canRun, config, plan])

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  const exportJson = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `otps-report-${report.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t('otps.title')}</h2>
        <p className="mt-2 text-slate-600">{t('otps.description')}</p>
      </div>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-900">{t('otps.settings')}</h3>

        <div className="mb-4">
          <span className="mb-2 block text-sm text-slate-700">{t('otps.modelSize')}</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="modelSize"
                checked={modelSize === 'gt10b'}
                onChange={() => setModelSize('gt10b')}
                disabled={running}
              />
              &gt;10B ({t('otps.tierL1L2')})
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="modelSize"
                checked={modelSize === 'lte10b'}
                onChange={() => setModelSize('lte10b')}
                disabled={running}
              />
              ≤10B (≥100 tokens/s)
            </label>
          </div>
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-700">
            {t('otps.maxTokens')}
            <input
              type="number"
              min={64}
              max={8192}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Math.min(8192, Math.max(64, Number(e.target.value) || 1024)))}
              disabled={running}
              className="mt-1 w-full rounded border border-surface-border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('otps.maxTokensHint')}</span>
          </label>
          <label className="block text-sm text-slate-700">
            {t('otps.requestsPerLevel')}
            <input
              type="number"
              min={1}
              max={50}
              value={requestsPerLevel}
              onChange={(e) =>
                setRequestsPerLevel(Math.min(50, Math.max(1, Number(e.target.value) || 5)))
              }
              disabled={running}
              className="mt-1 w-full rounded border border-surface-border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('otps.requestsPerLevelHint')}</span>
          </label>
          <label className="block text-sm text-slate-700">
            {t('ttft.rpm')}
            <input
              type="number"
              min={1}
              value={rpm}
              onChange={(e) => setRpm(Math.max(1, Number(e.target.value) || 10))}
              disabled={running}
              className="mt-1 w-full rounded border border-surface-border px-3 py-2"
            />
          </label>
          <label className="block text-sm text-slate-700">
            {t('ttft.tpm')}
            <input
              type="number"
              min={0}
              value={tpm}
              onChange={(e) => setTpm(Math.max(0, Number(e.target.value) || 0))}
              disabled={running}
              className="mt-1 w-full rounded border border-surface-border px-3 py-2"
            />
          </label>
        </div>

        <div className="mb-4">
          <span className="mb-2 block text-sm text-slate-700">{t('otps.selectConcurrency')}</span>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 4, 8, 16].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleConcurrency(c)}
                disabled={running}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  concurrencyLevels.includes(c)
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-surface-border bg-white text-slate-600'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          {t('otps.requestCountFormula', {
            count: totalRequestCount,
            levels: concurrencyLevels.length,
            perLevel: requestsPerLevel,
          })}
        </p>

        <div className="flex flex-wrap gap-2">
          {!running ? (
            <button
              type="button"
              onClick={() => void run()}
              disabled={!canRun}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-muted disabled:opacity-40"
            >
              {t('otps.runTest')}
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
            <>
              <button
                type="button"
                onClick={() => downloadOtpsExcel(report)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                {t('otps.exportExcel')}
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm shadow-sm"
              >
                {t('otps.exportJson')}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('otps.slaReference')}</h3>
        <SlaReferenceTable />
        <p className="mt-2 text-xs text-slate-500">{t('otps.slaNote')}</p>
      </section>

      {(running || liveRequests.length > 0) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">{t('otps.liveRequests')}</h3>
            {progress.total > 0 && (
              <span className="text-sm text-slate-500">
                {t('otps.progress', { done: progress.done, total: progress.total })}
                {currentConcurrency != null &&
                  ` · ${t('otps.runningConcurrency', { c: currentConcurrency })}`}
              </span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          )}
          <LiveRequestTable requests={liveRequests} />
        </section>
      )}

      {report && (
        <section className="space-y-6">
          <div>
            <h3 className="mb-3 font-semibold text-slate-900">{t('otps.slaResult')}</h3>
            <SlaResultTable report={report} />
          </div>
          <div>
            <h3 className="mb-3 font-semibold text-slate-900">{t('otps.levelSummary')}</h3>
            <LevelSummaryTable levels={report.levels} />
          </div>
        </section>
      )}

      {!running && !liveRequests.length && !report && (
        <p className="text-center text-slate-500">{t('otps.noData')}</p>
      )}
    </div>
  )
}
