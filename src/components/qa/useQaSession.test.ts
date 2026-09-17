import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QA_SESSION_STORAGE_KEY,
  clearStoredSessionId,
  ensureSessionId,
  loadStoredSessionId,
  rotateSessionId,
  storeSessionId,
} from './useQaSession';

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string): string | null => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadStoredSessionId / storeSessionId / clearStoredSessionId', () => {
  it('round-trips the id through the documented storage key', () => {
    expect(loadStoredSessionId()).toBeNull();
    storeSessionId('id-1');
    expect(localStorage.getItem(QA_SESSION_STORAGE_KEY)).toBe('id-1');
    expect(loadStoredSessionId()).toBe('id-1');
    clearStoredSessionId();
    expect(loadStoredSessionId()).toBeNull();
  });

  it('returns null when storage throws (private browsing)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadStoredSessionId()).toBeNull();
    expect(() => storeSessionId('x')).not.toThrow();
    expect(() => clearStoredSessionId()).not.toThrow();
  });
});

describe('ensureSessionId', () => {
  it('mints and persists on first use', async () => {
    const mint = vi.fn().mockResolvedValue('fresh-id');
    await expect(ensureSessionId(mint)).resolves.toBe('fresh-id');
    expect(mint).toHaveBeenCalledOnce();
    expect(loadStoredSessionId()).toBe('fresh-id');
  });

  it('reuses the stored id without minting', async () => {
    storeSessionId('stored-id');
    const mint = vi.fn();
    await expect(ensureSessionId(mint)).resolves.toBe('stored-id');
    expect(mint).not.toHaveBeenCalled();
  });

  it('does not persist anything when minting fails', async () => {
    const mint = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(ensureSessionId(mint)).rejects.toThrow('network down');
    expect(loadStoredSessionId()).toBeNull();
  });
});

describe('rotateSessionId', () => {
  it('DELETEs the old session, mints a new one, and stores it', async () => {
    const calls: Array<{ method: string; body?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        calls.push({ method: init?.method ?? 'GET', body: init?.body as string | undefined });
        const isDelete = init?.method === 'DELETE';
        return Promise.resolve(
          new Response(JSON.stringify(isDelete ? { ok: true } : { sessionId: 'new-id' }), {
            status: 200,
          }),
        );
      }),
    );
    storeSessionId('old-id');

    await expect(rotateSessionId('old-id')).resolves.toBe('new-id');

    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].body).toBe(JSON.stringify({ sessionId: 'old-id' }));
    expect(calls[1].method).toBe('POST');
    expect(loadStoredSessionId()).toBe('new-id');
  });

  it('still mints a fresh session when the DELETE fails (server TTL cleans up)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return Promise.resolve(new Response('boom', { status: 500 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ sessionId: 'new-id' }), { status: 200 }));
      }),
    );
    await expect(rotateSessionId('old-id')).resolves.toBe('new-id');
    expect(loadStoredSessionId()).toBe('new-id');
  });

  it('works with no current session (first topic)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sessionId: 'first-id' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(rotateSessionId(null)).resolves.toBe('first-id');
    expect(fetchMock).toHaveBeenCalledOnce(); // only the mint, no DELETE
    expect(loadStoredSessionId()).toBe('first-id');
  });
});
