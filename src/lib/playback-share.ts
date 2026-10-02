/**
 * Shared playback state for lesson narration.
 *
 * The lesson player (neural `NeuralPlayer` or the Web Speech `ListenButton`
 * fallback) and the floating pause/play button must always agree: one
 * authoritative status, one toggle entry point. This module is a tiny
 * framework-agnostic pub/sub store so the contract is unit-testable in
 * Node with no DOM; the React components subscribe to it.
 *
 * Wiring contract (see `LessonNarrator`):
 * - The active player calls `setStatus()` whenever its internal status
 *   changes and registers its toggle via `registerToggle()` (unregistering
 *   with `null` on unmount).
 * - The floating button subscribes for the status and drives playback
 *   through `toggle()`, which delegates to whichever player is active.
 * - `LessonNarrator` resets to `'idle'` on slug/accent change so a stale
 *   "playing" can never survive a player remount.
 *
 * Seek (block index, see `lib/listen-seek.ts`) rides the same bridge: the
 * active player registers `{ toBlock, step }` handlers and publishes which
 * directions are possible, so the floating button, the "read from here"
 * affordance and the resume link drive either engine identically.
 */

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

/** Which paragraph steps the active player can currently take. */
export interface SeekAvailability {
  canPrev: boolean;
  canNext: boolean;
}

/** Seek entry points the active player registers. */
export interface SeekHandlers {
  /** Jump to a block index; an idle player starts playing from it. */
  toBlock(block: number): void;
  /** Move one paragraph back (-1) or forward (+1) from the current block. */
  step(delta: -1 | 1): void;
}

const NO_SEEK: SeekAvailability = { canPrev: false, canNext: false };

/**
 * How far through the lesson the active player is, 0..1, or `null` when
 * there's nothing to show (idle, or the engine can't tell). Quantized so
 * a 60fps audio clock doesn't re-render the floating button every frame.
 */
export type PlaybackProgress = number | null;

const PROGRESS_STEPS = 200;

export function quantizeProgress(fraction: number | null): PlaybackProgress {
  if (fraction === null || !Number.isFinite(fraction)) return null;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return Math.round(clamped * PROGRESS_STEPS) / PROGRESS_STEPS;
}

export interface PlaybackShare {
  getStatus(): PlaybackStatus;
  /** Published by the active player on every internal status change. */
  setStatus(status: PlaybackStatus): void;
  subscribe(listener: (status: PlaybackStatus) => void): () => void;
  /** The active player registers its toggle; `null` unregisters (unmount). */
  registerToggle(toggle: (() => void) | null): void;
  /** Drives the currently registered player; no-op when none is registered. */
  toggle(): void;
  /** Stable snapshot (same object until it changes) for `useSyncExternalStore`. */
  getSeek(): SeekAvailability;
  /** Published by the active player; notifies seek subscribers on change only. */
  setSeek(next: SeekAvailability): void;
  subscribeSeek(listener: () => void): () => void;
  /** The active player registers its seek handlers; `null` unregisters. */
  registerSeek(handlers: SeekHandlers | null): void;
  /** Jump via the registered player. Returns false when none is registered. */
  seekToBlock(block: number): boolean;
  /** Step via the registered player. Returns false when none is registered. */
  step(delta: -1 | 1): boolean;
  /** Stable snapshot for `useSyncExternalStore`. */
  getProgress(): PlaybackProgress;
  /** Published by the active player; notifies subscribers on change only. */
  setProgress(fraction: number | null): void;
  subscribeProgress(listener: () => void): () => void;
}

export function createPlaybackShare(): PlaybackShare {
  let status: PlaybackStatus = 'idle';
  const listeners = new Set<(s: PlaybackStatus) => void>();
  let toggleFn: (() => void) | null = null;
  let seek: SeekAvailability = NO_SEEK;
  const seekListeners = new Set<() => void>();
  let seekHandlers: SeekHandlers | null = null;
  let progress: PlaybackProgress = null;
  const progressListeners = new Set<() => void>();

  return {
    getStatus: () => status,
    setStatus: (next) => {
      if (next === status) return;
      status = next;
      listeners.forEach((l) => l(status));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    registerToggle: (fn) => {
      toggleFn = fn;
    },
    toggle: () => {
      toggleFn?.();
    },
    getSeek: () => seek,
    setSeek: (next) => {
      if (next.canPrev === seek.canPrev && next.canNext === seek.canNext) return;
      seek = next.canPrev || next.canNext ? { ...next } : NO_SEEK;
      seekListeners.forEach((l) => l());
    },
    subscribeSeek: (listener) => {
      seekListeners.add(listener);
      return () => {
        seekListeners.delete(listener);
      };
    },
    registerSeek: (handlers) => {
      seekHandlers = handlers;
    },
    seekToBlock: (block) => {
      if (!seekHandlers) return false;
      seekHandlers.toBlock(block);
      return true;
    },
    step: (delta) => {
      if (!seekHandlers) return false;
      seekHandlers.step(delta);
      return true;
    },
    getProgress: () => progress,
    setProgress: (fraction) => {
      const next = quantizeProgress(fraction);
      if (next === progress) return;
      progress = next;
      progressListeners.forEach((l) => l());
    },
    subscribeProgress: (listener) => {
      progressListeners.add(listener);
      return () => {
        progressListeners.delete(listener);
      };
    },
  };
}
