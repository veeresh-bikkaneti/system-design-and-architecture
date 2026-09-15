import { useEffect, useState } from 'react';
import { DEFAULT_MODEL, useAISettingsStore } from '../store/aiSettings';

export interface SettingsModalProps {
  onClose: () => void;
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
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

export function SettingsModal({ onClose }: SettingsModalProps) {
  const apiKey = useAISettingsStore((state) => state.apiKey);
  const model = useAISettingsStore((state) => state.model);
  const setApiKey = useAISettingsStore((state) => state.setApiKey);
  const setModel = useAISettingsStore((state) => state.setModel);
  const clear = useAISettingsStore((state) => state.clear);

  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [modelDraft, setModelDraft] = useState(model || DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSave() {
    setApiKey(keyDraft.trim());
    setModel(modelDraft.trim() || DEFAULT_MODEL);
    onClose();
  }

  function handleClear() {
    clear();
    setKeyDraft('');
    setModelDraft(DEFAULT_MODEL);
  }

  const inputClasses =
    'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-600';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI tutor settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_20px_60px_rgb(120_53_15/0.25)] dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            <KeyIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-stone-900 dark:text-zinc-100">
              AI Tutor settings
            </h2>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              Bring your own key \u2014 optional, always.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="ai-api-key"
              className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-zinc-300"
            >
              Anthropic API key
            </label>
            <div className="flex gap-2">
              <input
                id="ai-api-key"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="sk-ant-..."
                className={`${inputClasses} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="shrink-0 rounded-xl border border-stone-300 px-3.5 text-xs font-semibold text-stone-600 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-amber-700 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="ai-model"
              className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-zinc-300"
            >
              Model
            </label>
            <input
              id="ai-model"
              type="text"
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              placeholder={DEFAULT_MODEL}
              className={inputClasses}
            />
          </div>

          <p className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 text-xs leading-relaxed text-stone-600 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-zinc-400">
            Your key is session-based: it lives only in this page&#8217;s memory
            and disappears when you reload or close the tab. It is never saved
            anywhere. It goes straight from your browser to Anthropic&#8217;s API
            &#8212; there&#8217;s no server in between &#8212; and it&#8217;s never sent
            anywhere else.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-stone-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-800 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          >
            Clear key
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-amber-700 px-6 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_rgb(180_83_9/0.3)] transition-all hover:-translate-y-px hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 active:translate-y-0"
          >
            Use key
          </button>
        </div>
      </div>
    </div>
  );
}
