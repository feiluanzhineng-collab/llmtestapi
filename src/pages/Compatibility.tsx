import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadCompatibilityExcel } from '../core/export-compat-excel'
import { listCompatibilityCases, runCompatibilitySuite } from '../core/compat-runner'
import { getCompatibilityCases } from '../suites/compatibility-cases'
import { useConfigStore } from '../stores/config-store'
import type { CompatCaseResult, CompatRunReport, CompatStepStatus } from '../types/compat'

function StatusBadge({ status }: { status: CompatStepStatus }) {
  const { t } = useTranslation()
  const styles: Record<CompatStepStatus, string> = {
    pending: 'bg-slate-100 text-slate-600',
    running: 'bg-blue-50 text-blue-700',
    pass: 'bg-emerald-50 text-emerald-700',
    fail: 'bg-rose-50 text-rose-700',
    skip: 'bg-amber-50 text-amber-700',
    error: 'bg-rose-50 text-rose-700',
  }
  const labels: Record<CompatStepStatus, string> = {
    pending: t('common.pending'),
    running: t('common.running'),
    pass: t('common.pass'),
    fail: t('common.fail'),
    skip: t('compat.skipped'),
    error: t('compat.error'),
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

export function CompatibilityPage() {
  const { t } = useTranslation()
  const config = useConfigStore((s) => s.config)
  const [includeOptional, setIncludeOptional] = useState(false)
  const [running, setRunning] = useState(false)
  const [liveCases, setLiveCases] = useState<CompatCaseResult[]>([])
  const [report, setReport] = useState<CompatRunReport | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const caseDefs = getCompatibilityCases(config.model || 'model')
  const runnableCount = caseDefs.filter((c) => includeOptional || !c.optional).length

  const run = useCallback(async () => {
    if (!config.apiKey || !config.model) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)
    setReport(null)
    setLiveCases([])

    const caseMap = new Map<string, CompatCaseResult>()

    try {
      await runCompatibilitySuite({
        config,
        includeOptional,
        signal: ac.signal,
        onProgress: (ev) => {
          if (ev.type === 'step-update') {
            const existing = caseMap.get(ev.caseId) ?? {
              caseId: ev.caseId,
              subject: caseDefs.find((c) => c.id === ev.caseId)?.subject ?? ev.caseId,
              status: 'running' as CompatStepStatus,
              steps: [],
            }
            const steps = [...existing.steps.filter((s) => s.stepId !== ev.step.stepId), ev.step]
            caseMap.set(ev.caseId, { ...existing, steps })
            setLiveCases(Array.from(caseMap.values()))
          }
          if (ev.type === 'case-done') {
            caseMap.set(ev.result.caseId, ev.result)
            setLiveCases(Array.from(caseMap.values()))
          }
          if (ev.type === 'complete') setReport(ev.report)
        },
      })
    } finally {
      setRunning(false)
    }
  }, [config, includeOptional, caseDefs])

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
    a.download = `compat-report-${report.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    if (!report) return
    downloadCompatibilityExcel(report, caseDefs)
  }

  const displayCases = report?.cases ?? liveCases

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t('compat.title')}</h2>
        <p className="mt-2 text-slate-600">{t('compat.description')}</p>
      </div>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-900">{t('compat.settings')}</h3>
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeOptional}
            onChange={(e) => setIncludeOptional(e.target.checked)}
            disabled={running}
            className="rounded border-surface-border"
          />
          {t('compat.includeOptional')}
        </label>
        <p className="mb-4 text-sm text-slate-500">
          {t('compat.caseCount', { count: runnableCount })}
        </p>
        <div className="flex gap-2">
          {!running ? (
            <button
              type="button"
              onClick={() => void run()}
              disabled={!config.apiKey || !config.model}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-muted disabled:opacity-40"
            >
              {t('compat.runAll')}
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
                onClick={exportExcel}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                {t('compat.exportExcel')}
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm shadow-sm"
              >
                {t('compat.exportJson')}
              </button>
            </>
          )}
        </div>
      </section>

      {report && (
        <div className="flex gap-4 rounded-lg border border-surface-border bg-slate-50 px-4 py-3 text-sm">
          <span>{t('compat.summaryTotal', { n: report.summary.total })}</span>
          <span className="text-emerald-700">{t('common.pass')}: {report.summary.pass}</span>
          <span className="text-rose-600">{t('common.fail')}: {report.summary.fail}</span>
          <span className="text-amber-700">{t('compat.skipped')}: {report.summary.skip}</span>
        </div>
      )}

      <section className="space-y-4">
        <h3 className="font-semibold text-slate-900">{t('compat.results')}</h3>
        {!displayCases.length && !running && (
          <p className="text-center text-slate-500">{t('compat.noData')}</p>
        )}
        {displayCases.map((caseResult) => {
          const def = caseDefs.find((c) => c.id === caseResult.caseId)
          return (
            <div
              key={caseResult.caseId}
              className="rounded-xl border border-surface-border bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
                <div>
                  <span className="font-medium text-slate-900">{caseResult.subject}</span>
                  {def && (
                    <p className="mt-0.5 text-xs text-slate-500">{def.testPoints}</p>
                  )}
                </div>
                <StatusBadge status={caseResult.status} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">{t('compat.step')}</th>
                      <th className="px-3 py-2">{t('common.status')}</th>
                      <th className="px-3 py-2">HTTP</th>
                      <th className="px-3 py-2">{t('common.duration')}</th>
                      <th className="px-3 py-2">{t('common.notes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseResult.steps.map((step) => (
                      <tr key={step.stepId} className="border-t border-surface-border">
                        <td className="px-3 py-2">{step.label}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={step.status} />
                        </td>
                        <td className="px-3 py-2 font-mono">{step.httpStatus || '—'}</td>
                        <td className="px-3 py-2">{step.durationMs ? `${step.durationMs}ms` : '—'}</td>
                        <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-600">
                          {step.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {def && (
                <div className="border-t border-surface-border bg-slate-50 px-4 py-2 text-xs text-slate-500">
                  {t('compat.risk')}: {def.risk}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('compat.caseList')}</h3>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {listCompatibilityCases(true).map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-slate-600">
              <span className="font-medium text-slate-800">{c.subject}</span>
              {c.optional && (
                <span className="rounded bg-amber-50 px-1 text-xs text-amber-700">
                  {t('compat.optional')}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
