import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { testConnection } from '../../core/api-client'
import { useConfigStore } from '../../stores/config-store'

export function ConfigPanel() {
  const { t } = useTranslation()
  const { config, setConfig } = useConfigStore()
  const [draft, setDraft] = useState(config)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
    setTestResult(null)
  }

  function handleSave() {
    setConfig(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const result = await testConnection(draft)
    setTestResult(result)
    setTesting(false)
  }

  return (
    <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('config.title')}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm text-slate-700">{t('config.baseUrl')}</span>
          <input
            type="url"
            value={draft.baseUrl}
            onChange={(e) => update('baseUrl', e.target.value)}
            placeholder="https://api.example.com/v1"
            className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <span className="mt-1 block text-xs text-slate-500">{t('config.baseUrlHint')}</span>
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm text-slate-700">{t('config.apiKey')}</span>
          <input
            type="password"
            value={draft.apiKey}
            onChange={(e) => update('apiKey', e.target.value)}
            placeholder="sk-..."
            className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            autoComplete="off"
          />
          <span className="mt-1 block text-xs text-slate-500">{t('config.apiKeyHint')}</span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">{t('config.model')}</span>
          <input
            type="text"
            value={draft.model}
            onChange={(e) => update('model', e.target.value)}
            placeholder="gpt-4o"
            className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <span className="mt-1 block text-xs text-slate-500">{t('config.modelHint')}</span>
        </label>

        <label className="flex items-center gap-2 self-end pb-6 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.useProxy}
            onChange={(e) => update('useProxy', e.target.checked)}
            className="rounded border-surface-border"
          />
          <span>
            {t('config.useProxy')}
            <span className="block text-xs text-slate-500">{t('config.useProxyHint')}</span>
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-muted"
        >
          {saved ? t('config.saved') : t('config.save')}
        </button>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing}
          className="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {testing ? t('config.testing') : t('config.testConnection')}
        </button>
        {testResult && (
          <span className={`text-sm ${testResult.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
            {testResult.ok ? t('config.connectionOk') : t('config.connectionFail')}:{' '}
            {testResult.message}
          </span>
        )}
      </div>
    </section>
  )
}
