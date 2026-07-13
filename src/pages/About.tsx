import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { COMPANY, GITHUB_REPO } from '../data/company'

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:text-accent-muted underline-offset-2 hover:underline"
    >
      {children}
    </a>
  )
}

export function AboutPage() {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  const companyName = isZh ? COMPANY.nameZh : COMPANY.nameEn

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-5">
        <img src="/logo.png" alt="Feiluan" className="h-16 w-16 shrink-0 rounded-xl shadow-sm" />
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('about.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{companyName}</p>
        </div>
      </div>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{t('about.projectTitle')}</h3>
        <p className="mt-2 text-slate-600">{t('about.projectBody')}</p>
        <p className="mt-3">
          <ExternalLink href={GITHUB_REPO}>{t('about.viewOnGitHub')}</ExternalLink>
        </p>
      </section>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{t('about.companyTitle')}</h3>
        <p className="mt-2 text-slate-600">{t('about.companyIntro')}</p>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>🚀 {t('about.highlightTpm')}</li>
          <li>📜 {t('about.highlightSla')}</li>
          <li>🔌 {t('about.highlightCompat')}</li>
          <li>🤝 {t('about.highlightB2b')}</li>
        </ul>
      </section>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">{t('about.contactTitle')}</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-slate-700">{t('about.phone')}</dt>
            <dd>
              <a href={`tel:${COMPANY.phone.replace(/\s/g, '')}`} className="text-accent hover:underline">
                {COMPANY.phone}
              </a>
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-slate-700">{t('about.email')}</dt>
            <dd>
              <ExternalLink href={`mailto:${COMPANY.email}`}>{COMPANY.email}</ExternalLink>
            </dd>
          </div>
          {COMPANY.products.map((p) => (
            <div key={p.url} className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-slate-700">{t(p.labelKey)}</dt>
              <dd>
                <ExternalLink href={p.url}>{p.url.replace(/^https?:\/\//, '')}</ExternalLink>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-slate-500">{t('about.contactHint')}</p>
      </section>
    </div>
  )
}
