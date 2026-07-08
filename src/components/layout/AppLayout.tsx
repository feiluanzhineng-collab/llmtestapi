import type { ReactNode } from 'react'
import { LanguageSwitcher } from '../common/LanguageSwitcher'
import { ConfigSummary } from '../config/ConfigSummary'
import { Sidebar } from './Sidebar'
import type { SuiteId } from '../../types'

interface AppLayoutProps {
  active: SuiteId
  onNavigate: (id: SuiteId) => void
  children: ReactNode
}

export function AppLayout({ active, onNavigate, children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar active={active} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-surface-border bg-surface-raised px-6 py-3 shadow-sm">
          {active !== 'dashboard' ? (
            <ConfigSummary onEdit={() => onNavigate('dashboard')} />
          ) : (
            <div className="flex-1" />
          )}
          <LanguageSwitcher />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
