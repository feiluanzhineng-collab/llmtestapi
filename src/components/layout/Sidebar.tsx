import { useTranslation } from 'react-i18next'
import type { SuiteId } from '../../types'
import { SUITES } from '../../types'
import { GITHUB_REPO } from '../../data/company'

interface SidebarProps {
  active: SuiteId
  onNavigate: (id: SuiteId) => void
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-surface-border bg-surface-raised shadow-sm">
      <div className="border-b border-surface-border px-4 py-4">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex w-full items-center gap-3 text-left"
        >
          <img src="/logo.png" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-slate-900">{t('app.title')}</h1>
            <p className="truncate text-[11px] text-slate-500">{t('app.subtitle')}</p>
          </div>
        </button>
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

      <div className="space-y-1 border-t border-surface-border p-3">
        <button
          type="button"
          onClick={() => onNavigate('about')}
          className={`flex w-full rounded-lg px-3 py-2 text-left text-sm transition ${
            active === 'about'
              ? 'bg-accent/10 text-accent'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {t('nav.about')}
        </button>
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <GitHubIcon />
          {t('nav.github')}
        </a>
      </div>
    </aside>
  )
}

function GitHubIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}
