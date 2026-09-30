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
 */

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PlaybackShare {
  getStatus(): PlaybackStatus;
  /** Published by the active player on every internal status change. */
  setStatus(status: PlaybackStatus): void;
  subscribe(listener: (status: PlaybackStatus) => void): () => void;
  /** The active player registers its toggle; `null` unregisters (unmount). */
  registerToggle(toggle: (() => void) | null): void;
  /** Drives the currently registered player; no-op when none is registered. */
  toggle(): void;
}

export function createPlaybackShare(): PlaybackShare {
  let status: PlaybackStatus = 'idle';
  const listeners = new Set<(s: PlaybackStatus) => void>();
  let toggleFn: (() => void) | null = null;

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
  };
}
