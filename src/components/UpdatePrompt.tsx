import { useEffect, useRef, useState } from 'react';

/**
 * T-PWA-3 (Chair PASS): the update prompt banner.
 *
 * Shown only when a waiting service worker exists AND a controller already
 * exists (never on first install). Update posts SKIP_WAITING to the freshly
 * re-fetched waiting worker and reloads exactly once on controllerchange;
 * the reload is always user-initiated, never automatic. A controllerchange
 * in a tab that did not click Update never reloads that tab — its prompt
 * converts to a Reload variant instead. Dismiss is literal in-memory only
 * (no version key exists to persist it against), so a new waiting worker
 * re-shows the banner and a reload re-evaluates from scratch.
 *
 * Detection lives inline here (no hook file): mount check, window-load
 * re-check (App mounts before the load event that registers the worker),
 * updatefound + installing statechange, and controllerchange — all cleaned
 * up on unmount. src/main.tsx is frozen and exposes no registration, so
 * this component detects via navigator.serviceWorker.getRegistration().
 * No fixed positioning, no z-index, no entrance animation in v1: the
 * banner is in-flow, mounted before <Routes> in App.tsx, so it collides
 * with nothing (sticky header, Ko-fi bench, playback button, Q&A).
 */
export interface UpdatePromptProps {
  /** Reload seam for tests (jsdom's location.reload() is unimplemented). */
  onReload?: () => void;
}

type Mode = 'update' | 'reload';

export function UpdatePrompt({ onReload }: UpdatePromptProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [updating, setUpdating] = useState(false);

  const modeRef = useRef<Mode | null>(null);
  const waitingRef = useRef<ServiceWorker | null>(null);
  const updatingRef = useRef(false);
  const reloadedRef = useRef(false);
  const dismissedWaitingRef = useRef<ServiceWorker | null>(null);
  const dismissedReloadRef = useRef(false);
  const lastControllerExistedRef = useRef(false);
  const preBannerFocusRef = useRef<HTMLElement | null>(null);
  const onReloadRef = useRef(onReload ?? (() => window.location.reload()));

  useEffect(() => {
    onReloadRef.current = onReload ?? (() => window.location.reload());
  }, [onReload]);

  const setModeBoth = (next: Mode | null): void => {
    modeRef.current = next;
    setMode(next);
  };

  const setWaitingBoth = (next: ServiceWorker | null): void => {
    waitingRef.current = next;
  };

  const setUpdatingBoth = (next: boolean): void => {
    updatingRef.current = next;
    setUpdating(next);
  };

  /** Capture the pre-banner focus target on the null -> shown transition. */
  const showPrompt = (next: Mode, nextWaiting: ServiceWorker | null): void => {
    if (modeRef.current === null) {
      const active = document.activeElement;
      preBannerFocusRef.current = active instanceof HTMLElement ? active : null;
    }
    setWaitingBoth(nextWaiting);
    setModeBoth(next);
  };

  const restoreFocus = (): void => {
    const target = preBannerFocusRef.current;
    if (target && document.contains(target)) {
      target.focus();
      return;
    }
    const main = document.getElementById('main-content');
    if (main) {
      main.focus();
      return;
    }
    document.body.focus();
  };

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return undefined;

    let cancelled = false;
    let attachedReg: ServiceWorkerRegistration | null = null;
    let attachedRegHandler: (() => void) | null = null;
    let attachedInstalling: ServiceWorker | null = null;
    let attachedInstallingHandler: (() => void) | null = null;

    /** Re-evaluate the prompt from a registration snapshot. */
    const evaluate = (reg: ServiceWorkerRegistration | null | undefined): void => {
      lastControllerExistedRef.current = Boolean(navigator.serviceWorker?.controller);
      if (!reg) {
        setModeBoth(null);
        setWaitingBoth(null);
        return;
      }
      const nextWaiting = reg.waiting;
      if (nextWaiting) {
        if (dismissedWaitingRef.current === nextWaiting) return;
        // A new waiting worker clears any earlier dismiss.
        dismissedWaitingRef.current = null;
        dismissedReloadRef.current = false;
        showPrompt('update', nextWaiting);
        return;
      }
      if (
        modeRef.current === 'update' &&
        dismissedWaitingRef.current === null &&
        !dismissedReloadRef.current
      ) {
        // Waiting vanished without a controllerchange reaching us (e.g. a
        // load re-check after another tab activated it): convert, don't hide.
        if (navigator.serviceWorker?.controller) {
          setModeBoth('reload');
        } else {
          setModeBoth(null);
        }
        setWaitingBoth(null);
        return;
      }
      // Hidden, or already in the Reload variant: stay put, waiting is gone.
      setWaitingBoth(null);
    };

    const refresh = async (): Promise<void> => {
      try {
        const reg = await sw.getRegistration();
        if (cancelled) return;
        if (reg !== attachedReg) {
          if (attachedReg && attachedRegHandler) {
            attachedReg.removeEventListener('updatefound', attachedRegHandler);
          }
          attachedReg = reg ?? null;
          attachedRegHandler = null;
          if (reg) {
            const onUpdateFound = (): void => {
              const installing = reg.installing;
              if (!installing) return;
              const onStateChange = (): void => {
                if (installing.state === 'installed') {
                  void refresh();
                }
              };
              attachedInstalling = installing;
              attachedInstallingHandler = onStateChange;
              installing.addEventListener('statechange', onStateChange);
            };
            attachedRegHandler = onUpdateFound;
            reg.addEventListener('updatefound', onUpdateFound);
          }
        }
        evaluate(reg);
      } catch {
        // No registration / rejected lookup: no prompt, app works as before.
      }
    };

    const handleControllerChange = (): void => {
      if (updatingRef.current && !reloadedRef.current) {
        reloadedRef.current = true;
        onReloadRef.current();
        return;
      }
      if (dismissedWaitingRef.current !== null || dismissedReloadRef.current) {
        return;
      }
      if (modeRef.current === 'update') {
        setModeBoth('reload');
        setWaitingBoth(null);
        return;
      }
      if (modeRef.current === null && lastControllerExistedRef.current) {
        showPrompt('reload', null);
      }
      // Otherwise: already in Reload mode, or first install — nothing to do.
    };

    const handleLoad = (): void => {
      void refresh();
    };

    sw.addEventListener('controllerchange', handleControllerChange);
    window.addEventListener('load', handleLoad);
    void refresh();

    return () => {
      cancelled = true;
      sw.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('load', handleLoad);
      if (attachedReg && attachedRegHandler) {
        attachedReg.removeEventListener('updatefound', attachedRegHandler);
      }
      if (attachedInstalling && attachedInstallingHandler) {
        attachedInstalling.removeEventListener('statechange', attachedInstallingHandler);
      }
    };
    // Mount-only: all mutable state lives in refs, never in dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdate = async (): Promise<void> => {
    if (modeRef.current !== 'update' || updatingRef.current) return;
    setUpdatingBoth(true);
    try {
      const sw = navigator.serviceWorker;
      if (!sw) {
        setUpdatingBoth(false);
        return;
      }
      const reg = await sw.getRegistration();
      if (!reg) {
        setUpdatingBoth(false);
        setModeBoth(null);
        setWaitingBoth(null);
        return;
      }
      const freshWaiting = reg.waiting;
      if (!freshWaiting) {
        // Stale waiting: another tab already activated the new worker.
        setUpdatingBoth(false);
        if (navigator.serviceWorker?.controller) {
          setModeBoth('reload');
        } else {
          setModeBoth(null);
        }
        setWaitingBoth(null);
        return;
      }
      freshWaiting.postMessage({ type: 'SKIP_WAITING' });
      setWaitingBoth(freshWaiting);
      // Stay updating until controllerchange reloads us exactly once.
    } catch {
      // Re-fetch failed: keep the prompt so the user can retry; never throw.
      setUpdatingBoth(false);
    }
  };

  const handleReload = (): void => {
    if (reloadedRef.current) return;
    reloadedRef.current = true;
    onReloadRef.current();
  };

  const handleDismiss = (): void => {
    if (modeRef.current === 'update' && waitingRef.current) {
      dismissedWaitingRef.current = waitingRef.current;
    }
    if (modeRef.current === 'reload') {
      dismissedReloadRef.current = true;
    }
    // Dismiss during updating disarms the pending reload.
    setUpdatingBoth(false);
    setModeBoth(null);
    setWaitingBoth(null);
    restoreFocus();
  };

  if (mode === null) return null;

  return (
    <div className="border-b border-stone-200/80 bg-amber-50/70 px-4 py-3 sm:px-6 dark:border-stone-800 dark:bg-amber-950/20">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
        <p aria-live="polite" className="flex-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
          New version available
        </p>
        {mode === 'update' ? (
          <button
            type="button"
            onClick={() => void handleUpdate()}
            disabled={updating}
            className="rounded-xl bg-accent-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-accent-400 dark:text-stone-950"
          >
            Update
          </button>
        ) : (
          <button
            type="button"
            onClick={handleReload}
            className="rounded-xl bg-accent-700 px-4 py-2 text-sm font-semibold text-white dark:bg-accent-400 dark:text-stone-950"
          >
            Reload
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-xl px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
