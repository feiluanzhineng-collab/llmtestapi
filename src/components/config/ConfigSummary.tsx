import { useTranslation } from 'react-i18next'
import { useConfigStore } from '../../stores/config-store'
import { maskApiKey } from '../../types/config'

export function ConfigSummary({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation()
  const config = useConfigStore((s) => s.config)
  const ready = Boolean(config.apiKey.trim() && config.model.trim())

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">
      {ready ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-600">
          <span className="font-medium text-slate-800">{config.model}</span>
          <span className="hidden text-slate-300 sm:inline">·</span>
          <span className="hidden max-w-[240px] truncate font-mono text-xs sm:inline">
            {config.baseUrl}
          </span>
          <span className="hidden text-slate-300 md:inline">·</span>
          <span className="hidden font-mono text-xs text-slate-400 md:inline">
            {maskApiKey(config.apiKey)}
          </span>
        </div>
      ) : (
        <span className="text-amber-700">{t('config.notConfigured')}</span>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-xs text-accent hover:underline"
      >
        {t('config.editOnDashboard')}
      </button>
    </div>
  )
}
