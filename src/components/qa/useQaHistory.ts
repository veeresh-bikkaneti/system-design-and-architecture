import { useEffect, useState } from 'react';

/**
 * Anonymous Session architecture: there is no server-side session of any
 * kind (see worker/README.md). The browser IS the memory -- this hook
 * persists the widget's message transcript to localStorage so it survives
 * a reload, and the full array is what QaWidget sends as the `messages`
 * field on every /api/qa/chat request.
 */
export const QA_HISTORY_STORAGE_KEY = 'sd.qa.history';

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined';
}

/** Loads the persisted transcript, or an empty array. Never throws. */
export function loadStoredHistory<T>(): T[] {
  try {
    if (!storageAvailable()) return [];
    const raw = localStorage.getItem(QA_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return []; // corrupt JSON or e.g. private browsing where storage throws
  }
}

function storeHistory<T>(messages: T[]): void {
  try {
    if (!storageAvailable()) return;
    localStorage.setItem(QA_HISTORY_STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Quota exceeded or storage unavailable: the conversation simply won't
    // survive a reload. Chat still works for the rest of this visit.
  }
}

export function clearStoredHistory(): void {
  try {
    if (storageAvailable()) localStorage.removeItem(QA_HISTORY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * A `messages` array that's transparently persisted to localStorage. Reads
 * once on mount, writes on every change. `T` is whatever shape the caller's
 * message list uses (kept generic so QaWidget's richer in-memory message
 * type -- with ids, sources, confidence -- round-trips as-is).
 */
export function useQaHistory<T>(): [T[], (updater: T[] | ((prev: T[]) => T[])) => void] {
  const [messages, setMessagesState] = useState<T[]>(() => loadStoredHistory<T>());

  useEffect(() => {
    storeHistory(messages);
  }, [messages]);

  const setMessages = (updater: T[] | ((prev: T[]) => T[])): void => {
    setMessagesState(updater);
  };

  return [messages, setMessages];
}
