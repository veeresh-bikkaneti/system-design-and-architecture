import { useSessionStore } from '../store/session';
import { syncNow } from './gist-sync';

export const IDLE_FLUSH_MS = 60_000;
export const IDLE_PAUSE_MS = 600_000;
export const SYNC_TICK_MS = 60_000;

export function startIdleWatch(now: () => number = () => Date.now()): () => void {
  let lastActivity = now();
  let flushedIdle = false;
  let pausedOnce = false;

  const onActivity = () => {
    lastActivity = now();
    flushedIdle = false;
    pausedOnce = false;
  };

  const onHidden = () => {
    const session = useSessionStore.getState();
    if (session.isSignedIn() && session.dirty) {
      void syncNow({ evenIfPaused: true });
    }
  };

  const tick = () => {
    const session = useSessionStore.getState();
    const idleFor = now() - lastActivity;

    if (session.isSignedIn() && session.dirty && session.pausedAt === null) {
      void syncNow();
    }

    if (idleFor >= IDLE_FLUSH_MS && !flushedIdle) {
      flushedIdle = true;
      if (session.isSignedIn() && session.dirty) {
        void syncNow();
      }
    }

    if (idleFor >= IDLE_PAUSE_MS && !pausedOnce) {
      pausedOnce = true;
      if (session.isSignedIn()) {
        void syncNow({ evenIfPaused: true });
        useSessionStore.getState().pause();
      }
    }
  };

  const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];
  for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHidden();
  });
  window.addEventListener('pagehide', onHidden);

  const interval = setInterval(tick, SYNC_TICK_MS);
  return () => {
    clearInterval(interval);
    for (const ev of events) window.removeEventListener(ev, onActivity);
    window.removeEventListener('pagehide', onHidden);
  };
}
