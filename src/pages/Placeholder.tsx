import { useTranslation } from 'react-i18next'
import type { SuiteId } from '../types'

interface PlaceholderPageProps {
  suiteId: Exclude<SuiteId, 'dashboard' | 'performance'>
}

export function PlaceholderPage({ suiteId }: PlaceholderPageProps) {
  const { t } = useTranslation()
  const name = t(`nav.${suiteId}`)

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-surface-border bg-surface-raised p-10 text-center shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">
        {t('placeholder.title', { name })}
      </h2>
      <p className="mt-3 text-slate-600">{t('placeholder.body')}</p>
    </div>
  )
}
