import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_MODEL = 'claude-opus-5';

export interface AISettingsState {
  apiKey: string;
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
    },
  ),
);
