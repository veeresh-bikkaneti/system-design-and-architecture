import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredHistory, loadStoredHistory, QA_HISTORY_STORAGE_KEY } from './useQaHistory';

interface StoredMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

/** Minimal in-memory localStorage stand-in (this test runs under vitest's plain node environment, no DOM). */
function makeFakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

/**
 * There is no backend and no server-side session: the widget's entire
 * memory is whatever useQaHistory persists to localStorage. These tests
 * exercise that persistence layer directly (no DOM needed).
 */
describe('useQaHistory persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeFakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty array when nothing is stored', () => {
    expect(loadStoredHistory<StoredMessage>()).toEqual([]);
  });

  it('round-trips a stored transcript', () => {
    const messages: StoredMessage[] = [
      { id: 0, role: 'user', content: 'what is the CAP theorem?' },
      { id: 1, role: 'assistant', content: 'the course covers this.' },
    ];
    localStorage.setItem(QA_HISTORY_STORAGE_KEY, JSON.stringify(messages));
    expect(loadStoredHistory<StoredMessage>()).toEqual(messages);
  });

  it('treats corrupt or non-array JSON as empty instead of throwing', () => {
    localStorage.setItem(QA_HISTORY_STORAGE_KEY, 'not-json{{{');
    expect(loadStoredHistory<StoredMessage>()).toEqual([]);

    localStorage.setItem(QA_HISTORY_STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    expect(loadStoredHistory<StoredMessage>()).toEqual([]);
  });

  it('clearStoredHistory removes the key', () => {
    localStorage.setItem(QA_HISTORY_STORAGE_KEY, JSON.stringify([{ id: 0 }]));
    clearStoredHistory();
    expect(localStorage.getItem(QA_HISTORY_STORAGE_KEY)).toBeNull();
    expect(loadStoredHistory<StoredMessage>()).toEqual([]);
  });

  it('is resilient when localStorage does not exist at all (e.g. private browsing)', () => {
    vi.unstubAllGlobals();
    expect(loadStoredHistory<StoredMessage>()).toEqual([]);
    expect(() => clearStoredHistory()).not.toThrow();
  });
});
