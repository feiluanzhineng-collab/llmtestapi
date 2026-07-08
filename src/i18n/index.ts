import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zh from './locales/zh.json'

const STORAGE_KEY = 'llm-api-test-lang'

function detectLanguage(): string {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'zh') return saved
  return navigator.language.startsWith('zh') ? 'zh' : 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang: 'en' | 'zh') {
  localStorage.setItem(STORAGE_KEY, lang)
  void i18n.changeLanguage(lang)
}

export default i18n
