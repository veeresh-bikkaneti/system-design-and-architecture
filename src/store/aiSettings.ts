import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Which API the tutor talks to. `anthropic` and `openai` are the two
 * first-party providers; `custom` is any OpenAI-compatible chat-completions
 * endpoint (a proxy, a gateway, or a self-hosted model server).
 */
export type AIProvider = 'anthropic' | 'openai' | 'custom';

export interface ProviderPreset {
  id: AIProvider;
  /** Short label shown in the provider picker. */
  label: string;
  /** Label for the API key field, e.g. "Anthropic API key". */
  keyLabel: string;
  keyPlaceholder: string;
  /** Pre-filled endpoint; the user can still edit it. */
  defaultBaseUrl: string;
  defaultModel: string;
  /** One-line help shown under the endpoint field. */
  endpointHint: string;
  /** Noun used in the privacy note, e.g. "Anthropic's API". */
  apiNoun: string;
  /**
   * Where a non-technical learner can create an API key. Omitted for
   * `custom`, where the key comes from the user's own endpoint provider.
   */
  keyUrl?: string;
}

export const PROVIDER_PRESETS: Record<AIProvider, ProviderPreset> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-...',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-5',
    endpointHint: 'The Anthropic Messages API endpoint. Change it only if you route through a proxy.',
    apiNoun: "Anthropic's API",
    keyUrl: 'https://console.anthropic.com/',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-...',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    endpointHint: 'Any OpenAI-compatible chat-completions endpoint works here.',
    apiNoun: "OpenAI's API",
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  custom: {
    id: 'custom',
    label: 'Custom endpoint',
    keyLabel: 'API key',
    keyPlaceholder: 'your-api-key',
    defaultBaseUrl: '',
    defaultModel: '',
    endpointHint: 'Base URL of an OpenAI-compatible API, e.g. https://your-endpoint.example.com/v1',
    apiNoun: 'your endpoint',
  },
};

export const DEFAULT_PROVIDER: AIProvider = 'anthropic';
export const DEFAULT_MODEL = PROVIDER_PRESETS.anthropic.defaultModel;
export const DEFAULT_BASE_URL = PROVIDER_PRESETS.anthropic.defaultBaseUrl;

export function isAIProvider(value: unknown): value is AIProvider {
  return value === 'anthropic' || value === 'openai' || value === 'custom';
}

export interface AISettingsState {
  /**
   * Session-only by design: kept in memory, never written to any storage.
   * Reloading or closing the tab wipes it, so the user re-enters it each
   * visit. This is the code behind the privacy promise "we never capture
   * your key" — there is simply nothing persisted to capture.
   */
  apiKey: string;
  /** Which provider the tutor talks to. Safe to persist. */
  provider: AIProvider;
  /** Endpoint base URL, e.g. https://api.openai.com/v1. Safe to persist. */
  baseUrl: string;
  /** Harmless preference — safe to persist across visits. */
  model: string;
  setApiKey: (key: string) => void;
  /**
   * Switches provider and resets the endpoint + model to that provider's
   * defaults, so the three can never disagree. Edit baseUrl/model after.
   */
  setProvider: (provider: AIProvider) => void;
  setBaseUrl: (baseUrl: string) => void;
  setModel: (model: string) => void;
  clear: () => void;
}

/**
 * Pure v1 -> v2 migration, exported so it can be unit-tested without a
 * browser. v1 persisted only `{ model }`; v2 adds `provider` + `baseUrl`.
 * Anything unrecognized falls back to the Anthropic defaults, and a saved
 * apiKey from the pre-session era is dropped on the floor.
 */
export function migrateAiSettings(persistedState: unknown): {
  model: string;
  provider: AIProvider;
  baseUrl: string;
} {
  const s = (persistedState ?? {}) as {
    model?: unknown;
    provider?: unknown;
    baseUrl?: unknown;
  };
  const provider = isAIProvider(s.provider) ? s.provider : DEFAULT_PROVIDER;
  const preset = PROVIDER_PRESETS[provider];
  return {
    model: typeof s.model === 'string' && s.model ? s.model : preset.defaultModel,
    provider,
    baseUrl:
      typeof s.baseUrl === 'string' && s.baseUrl ? s.baseUrl : preset.defaultBaseUrl,
  };
}

export const useAISettingsStore = create<AISettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      provider: DEFAULT_PROVIDER,
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,

      setApiKey: (key) => set({ apiKey: key }),
      setProvider: (provider) => {
        const preset = PROVIDER_PRESETS[provider];
        set({ provider, baseUrl: preset.defaultBaseUrl, model: preset.defaultModel });
      },
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setModel: (model) => set({ model }),
      clear: () =>
        set({
          apiKey: '',
          provider: DEFAULT_PROVIDER,
          baseUrl: DEFAULT_BASE_URL,
          model: DEFAULT_MODEL,
        }),
    }),
    {
      name: 'sdm-ai-settings',
      // The API key is deliberately excluded from persistence: only the
      // provider, endpoint, and model choice are stored. The key lives in
      // memory for this page session only and is never written to
      // localStorage/sessionStorage.
      partialize: (state) => ({
        provider: state.provider,
        baseUrl: state.baseUrl,
        model: state.model,
      }),
      version: 2,
      migrate: (persistedState) => migrateAiSettings(persistedState),
    },
  ),
);
