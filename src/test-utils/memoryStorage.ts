import { vi } from 'vitest';

/**
 * Minimal structural type for Web Storage. The worker tsconfig has no DOM
 * lib, so the global `Storage` type is unavailable there — this keeps the
 * helper usable from both packages.
 */
export interface TestStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
}

/** In-memory Web Storage stand-in for tests (node has no localStorage). */
export function memoryStorage(): TestStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      data.set(k, String(v));
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

/**
 * Install a browser-like storage environment. This must run before importing
 * any module that creates a zustand persist store: zustand v5's default
 * storage is `createJSONStorage(() => window.localStorage)`, so stubbing only
 * the bare `localStorage` global leaves persistence silently disabled (with a
 * console warning). Returns the backing store for inspection/clearing.
 */
export function stubBrowserStorage(): TestStorage {
  const backing = memoryStorage();
  vi.stubGlobal('localStorage', backing);
  // Minimal window: only what the app's storage layer reads.
  vi.stubGlobal('window', { localStorage: backing });
  return backing;
}
