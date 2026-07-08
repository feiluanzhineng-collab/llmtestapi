import { useTranslation } from 'react-i18next'
import type { SuiteId } from '../../types'
import { SUITES } from '../../types'

interface SidebarProps {
  active: SuiteId
  onNavigate: (id: SuiteId) => void
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-surface-border bg-surface-raised shadow-sm">
      <div className="border-b border-surface-border px-4 py-5">
        <h1 className="text-base font-bold text-slate-900">{t('app.title')}</h1>
        <p className="mt-1 text-xs text-slate-500">{t('app.subtitle')}</p>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {SUITES.map((suite) => {
          const isActive = active === suite.id
          return (
            <button
              key={suite.id}
              type="button"
              onClick={() => onNavigate(suite.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span>{t(`nav.${suite.id}`)}</span>
              {!suite.available && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {t('nav.comingSoon')}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
