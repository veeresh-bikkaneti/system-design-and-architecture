import { useCallback, useEffect, useRef, useState } from 'react';
import { createSession, deleteSession } from './qaApi';

export const QA_SESSION_STORAGE_KEY = 'sd.qa.sessionId';

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined';
}

/** The anonymous session id persisted across page loads, or null. Never throws. */
export function loadStoredSessionId(): string | null {
  try {
    if (!storageAvailable()) return null;
    const value = localStorage.getItem(QA_SESSION_STORAGE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null; // e.g. private browsing where storage throws
  }
}

export function storeSessionId(id: string): void {
  try {
    if (storageAvailable()) localStorage.setItem(QA_SESSION_STORAGE_KEY, id);
  } catch {
    // Session simply won't survive a reload; chat still works this visit.
  }
}

export function clearStoredSessionId(): void {
  try {
    if (storageAvailable()) localStorage.removeItem(QA_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Reuse the stored session id, or mint a fresh one on first use and persist
 * it. Pure logic (no React) so the lifecycle is unit-testable.
 */
export async function ensureSessionId(
  mint: () => Promise<string> = createSession,
): Promise<string> {
  const stored = loadStoredSessionId();
  if (stored) return stored;
  const id = await mint();
  storeSessionId(id);
  return id;
}

/**
 * Wipe the current session's server-side memory, then mint a fresh id.
 * "New topic" = one session per study thread. DELETE is best-effort: the old
 * session expires via server-side TTL even if the wipe fails.
 */
export async function rotateSessionId(
  currentId: string | null,
  mint: () => Promise<string> = createSession,
): Promise<string> {
  if (currentId) {
    try {
      await deleteSession(currentId);
    } catch {
      // best-effort; TTL cleans up server-side
    }
  }
  clearStoredSessionId();
  const id = await mint();
  storeSessionId(id);
  return id;
}

export interface QaSession {
  /** Stored id if one exists, else null until first use mints one. */
  sessionId: string | null;
  /** Resolve the session id, minting on first use. Concurrent calls share one mint. */
  ensureSession: () => Promise<string>;
  /** Wipe memory and start a fresh study thread. */
  newTopic: () => Promise<void>;
}

export function useQaSession(): QaSession {
  const [sessionId, setSessionId] = useState<string | null>(() => loadStoredSessionId());
  const sessionRef = useRef<string | null>(sessionId);
  const inFlight = useRef<Promise<string> | null>(null);

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  const ensureSession = useCallback((): Promise<string> => {
    const current = sessionRef.current;
    if (current) return Promise.resolve(current);
    if (!inFlight.current) {
      inFlight.current = ensureSessionId()
        .then((id) => {
          inFlight.current = null;
          sessionRef.current = id;
          setSessionId(id);
          return id;
        })
        .catch((err: unknown) => {
          inFlight.current = null;
          throw err;
        });
    }
    return inFlight.current;
  }, []);

  const newTopic = useCallback(async (): Promise<void> => {
    const next = await rotateSessionId(sessionRef.current);
    sessionRef.current = next;
    setSessionId(next);
  }, []);

  return { sessionId, ensureSession, newTopic };
}
