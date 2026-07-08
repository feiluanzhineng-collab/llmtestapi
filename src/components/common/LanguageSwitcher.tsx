import { useTranslation } from 'react-i18next'
import { setLanguage } from '../../i18n'

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const current = i18n.language.startsWith('zh') ? 'zh' : 'en'

  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <span>{t('common.language')}</span>
      <select
        value={current}
        onChange={(e) => setLanguage(e.target.value as 'en' | 'zh')}
        className="rounded-md border border-surface-border bg-white px-2 py-1 text-slate-800 shadow-sm"
      >
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </div>
  )
}
