import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeBaseUrl } from '../core/base-url'
import { DEFAULT_CONFIG, type AppConfig } from '../types/config'
import { isHostedDeploy } from '../core/proxy-headers'

interface ConfigState {
  config: AppConfig
  setConfig: (partial: Partial<AppConfig>) => void
  resetConfig: () => void
}

function mergeHostedDefaults(config: AppConfig): AppConfig {
  if (!isHostedDeploy()) return config
  return {
    ...config,
    useProxy: true,
    baseUrl: normalizeBaseUrl(config.baseUrl || DEFAULT_CONFIG.baseUrl),
  }
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: mergeHostedDefaults(DEFAULT_CONFIG),
      setConfig: (partial) =>
        set((state) => {
          const next = { ...state.config, ...partial }
          if (partial.baseUrl != null) {
            next.baseUrl = normalizeBaseUrl(partial.baseUrl)
          }
          return { config: mergeHostedDefaults(next) }
        }),
      resetConfig: () => set({ config: mergeHostedDefaults(DEFAULT_CONFIG) }),
    }),
    {
      name: 'llm-api-test-config',
      merge: (persisted, current) => {
        const p = persisted as Partial<ConfigState> | undefined
        const merged = {
          ...current,
          ...p,
          config: { ...DEFAULT_CONFIG, ...p?.config },
        }
        return { ...merged, config: mergeHostedDefaults(merged.config) }
      },
    },
  ),
)
