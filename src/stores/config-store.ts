import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_CONFIG, type AppConfig } from '../types/config'

interface ConfigState {
  config: AppConfig
  setConfig: (partial: Partial<AppConfig>) => void
  resetConfig: () => void
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      setConfig: (partial) =>
        set((state) => ({ config: { ...state.config, ...partial } })),
      resetConfig: () => set({ config: DEFAULT_CONFIG }),
    }),
    { name: 'llm-api-test-config' },
  ),
)
