import { useEffect, useState } from 'react';
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  PROVIDER_PRESETS,
  isAIProvider,
  useAISettingsStore,
  type AIProvider,
} from '../store/aiSettings';
import { useDisplayStore, type ThemePreference } from '../store/display';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

export interface SettingsModalProps {
  onClose: () => void;
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M14.5 2.6a7.5 7.5 0 0 0-7.4 8.7L2.7 15.7a2.4 2.4 0 0 0 3.4 3.4l1.6-1.6v2.1a1 1 0 0 0 2 0v-2.6l1.2-1.2a7.5 7.5 0 1 0 3.6-13.2ZM12 13a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const PROVIDER_ORDER: AIProvider[] = ['anthropic', 'openai', 'custom'];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: 'sun' | 'moon' | 'monitor' }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const apiKey = useAISettingsStore((state) => state.apiKey);
  const provider = useAISettingsStore((state) => state.provider);
  const baseUrl = useAISettingsStore((state) => state.baseUrl);
  const model = useAISettingsStore((state) => state.model);
  const setApiKey = useAISettingsStore((state) => state.setApiKey);
  const setProvider = useAISettingsStore((state) => state.setProvider);
  const setBaseUrl = useAISettingsStore((state) => state.setBaseUrl);
  const setModel = useAISettingsStore((state) => state.setModel);
  const clear = useAISettingsStore((state) => state.clear);

  const theme = useDisplayStore((state) => state.theme);
  const setTheme = useDisplayStore((state) => state.setTheme);
  const calmMotion = useDisplayStore((state) => state.calmMotion);
  const setCalmMotion = useDisplayStore((state) => state.setCalmMotion);

  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [providerDraft, setProviderDraft] = useState<AIProvider>(
    isAIProvider(provider) ? provider : DEFAULT_PROVIDER,
  );
  const [baseUrlDraft, setBaseUrlDraft] = useState(baseUrl);
  const [modelDraft, setModelDraft] = useState(model || DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);

  const preset = PROVIDER_PRESETS[providerDraft];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleProviderChange(next: AIProvider) {
    setProviderDraft(next);
    // Point the endpoint and model at the new provider's defaults; the user
    // can still edit both fields afterwards.
    const nextPreset = PROVIDER_PRESETS[next];
    setBaseUrlDraft(nextPreset.defaultBaseUrl);
    setModelDraft(nextPreset.defaultModel);
  }

  function handleSave() {
    // setProvider resets endpoint + model to the provider defaults first,
    // then the explicit setters apply whatever the user typed.
    setProvider(providerDraft);
    setBaseUrl(baseUrlDraft.trim() || preset.defaultBaseUrl);
    setModel(modelDraft.trim() || preset.defaultModel);
    setApiKey(keyDraft.trim());
    onClose();
  }

  function handleClear() {
    clear();
    setKeyDraft('');
    setProviderDraft(DEFAULT_PROVIDER);
    setBaseUrlDraft(PROVIDER_PRESETS[DEFAULT_PROVIDER].defaultBaseUrl);
    setModelDraft(DEFAULT_MODEL);
  }

  const inputClasses =
    'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-amber-600';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_20px_60px_rgb(120_53_15/0.25)] dark:border-stone-700 dark:bg-stone-900"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            <KeyIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Settings
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Display, motion, and the optional AI tutor key.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
          >
            <Icon name="x" />
          </button>
        </div>

        {/* ---- Display: theme + motion budget ---- */}
        <section aria-label="Display" className="mb-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
            Appearance
          </p>
          <div
            role="radiogroup"
            aria-label="Color theme"
            className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-stone-200/70 p-1 dark:bg-stone-800"
          >
            {THEME_OPTIONS.map((option) => {
              const selected = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(option.value)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${
                    selected
                      ? 'bg-white text-stone-900 shadow-soft dark:bg-stone-700 dark:text-stone-50'
                      : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
                  }`}
                >
                  <Icon name={option.icon} className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={calmMotion}
            onClick={() => setCalmMotion(!calmMotion)}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            <span>
              <span className="block text-sm font-semibold text-stone-800 dark:text-stone-200">
                Calm animations
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                Freeze ambient loops — flowing edges, request dots, badge shimmer.
                Entrances still play.
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                calmMotion ? 'bg-accent-600 dark:bg-accent-500' : 'bg-stone-300 dark:bg-stone-700'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  calmMotion ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </section>

        <p className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
          AI tutor
        </p>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="ai-provider"
              className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
            >
              Provider
            </label>
            <select
              id="ai-provider"
              value={providerDraft}
              onChange={(e) => {
                const next = e.target.value;
                if (isAIProvider(next)) handleProviderChange(next);
              }}
              className={inputClasses}
            >
              {PROVIDER_ORDER.map((id) => (
                <option key={id} value={id}>
                  {PROVIDER_PRESETS[id].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ai-endpoint"
              className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
            >
              Endpoint URL
            </label>
            <input
              id="ai-endpoint"
              type="url"
              autoComplete="off"
              spellCheck={false}
              value={baseUrlDraft}
              onChange={(e) => setBaseUrlDraft(e.target.value)}
              placeholder={preset.defaultBaseUrl || 'https://your-endpoint.example.com/v1'}
              className={inputClasses}
            />
            <p className="mt-1 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
              {preset.endpointHint}
            </p>
          </div>

          <div>
            <label
              htmlFor="ai-api-key"
              className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
            >
              {preset.keyLabel}
            </label>
            <div className="flex gap-2">
              <input
                id="ai-api-key"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={preset.keyPlaceholder}
                className={`${inputClasses} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="shrink-0 rounded-xl border border-stone-300 px-3.5 text-xs font-semibold text-stone-600 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:border-stone-700 dark:text-stone-300 dark:hover:border-amber-700 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="mt-1.5 space-y-1 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
              <p>
                An API key is like a password that lets the tutor use your AI
                provider account.
              </p>
              <p>
                {preset.keyUrl ? (
                  <a
                    href={preset.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800 dark:text-amber-400 dark:decoration-amber-800 dark:hover:text-amber-300"
                  >
                    Where to get a key
                    <Icon name="external" className="h-3 w-3" />
                  </a>
                ) : (
                  'Get a key from your endpoint provider.'
                )}
              </p>
              <p>
                Tutor usage bills to your own provider account, not to us.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="ai-model"
              className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
            >
              Model
            </label>
            <input
              id="ai-model"
              type="text"
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              placeholder={preset.defaultModel || 'model-name'}
              className={inputClasses}
            />
          </div>

          <p className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 text-xs leading-relaxed text-stone-600 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-stone-400">
            Your key is session-based: it lives only in this page&#8217;s memory
            and disappears when you reload or close the tab. It is never saved
            anywhere. It goes straight from your browser to {preset.apiNoun}
            &#8212; there&#8217;s no server in between &#8212; and it&#8217;s never sent
            anywhere else.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-stone-200 pt-4 dark:border-stone-800">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition-[border-color,background-color,color] hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:border-stone-700 dark:text-stone-300 dark:hover:border-red-800 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          >
            Clear key
          </button>
          <Button type="button" onClick={handleSave} className="px-6">
            Use key
          </Button>
        </div>
      </div>
    </div>
  );
}
