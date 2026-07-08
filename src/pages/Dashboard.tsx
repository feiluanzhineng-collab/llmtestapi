import { useTranslation } from 'react-i18next'
import { ConfigPanel } from '../components/config/ConfigPanel'
import { SUITES } from '../types'

export function DashboardPage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t('dashboard.welcome')}</h2>
        <p className="mt-2 text-slate-600">{t('dashboard.description')}</p>
        <p className="mt-1 text-sm text-slate-500">{t('dashboard.configHint')}</p>
      </div>

      <ConfigPanel />

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold">{t('dashboard.modules')}</h3>
        <ul className="space-y-2">
          {SUITES.filter((s) => s.id !== 'dashboard').map((suite) => (
            <li
              key={suite.id}
              className="flex items-center justify-between rounded-lg border border-surface-border px-4 py-3"
            >
              <span className="text-slate-700">{t(`nav.${suite.id}`)}</span>
              <span
                className={`text-xs font-medium ${
                  suite.available ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {suite.available ? t('dashboard.ready') : t('dashboard.planned')}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
