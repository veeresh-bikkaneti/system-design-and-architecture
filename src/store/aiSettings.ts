import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_MODEL = 'claude-opus-5';

export interface AISettingsState {
  /**
   * Session-only by design: kept in memory, never written to any storage.
   * Reloading or closing the tab wipes it, so the user re-enters it each
   * visit. This is the code behind the privacy promise "we never capture
   * your key" — there is simply nothing persisted to capture.
   */
  apiKey: string;
  /** Harmless preference — safe to persist across visits. */
  model: string;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  clear: () => void;
}

export const useAISettingsStore = create<AISettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      model: DEFAULT_MODEL,

      setApiKey: (key) => set({ apiKey: key }),
      setModel: (model) => set({ model }),
      clear: () => set({ apiKey: '', model: DEFAULT_MODEL }),
    }),
    {
      name: 'sdm-ai-settings',
      // The API key is deliberately excluded from persistence: only the
      // model choice is stored. The key lives in memory for this page
      // session only and is never written to localStorage/sessionStorage.
      partialize: (state) => ({ model: state.model }),
      // Version 1: pre-session-key entries (version 0) may still hold a
      // saved apiKey in localStorage. Migrating strips everything except
      // the model on first load, so an old saved key can never come back
      // to life in memory — and the migrated write purges it from disk.
      version: 1,
      migrate: (persistedState) => {
        const s = (persistedState ?? {}) as { model?: unknown };
        return {
          model: typeof s.model === 'string' && s.model ? s.model : DEFAULT_MODEL,
        };
      },
    },
  ),
);
