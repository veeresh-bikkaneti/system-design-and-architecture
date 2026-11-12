// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Branch 1 / F1 (#153 surviving surface): acceptance tests for the embedder
 * load readiness contract, modelled block-for-block on
 * `inference.readiness.test.ts` (the R-02 contract for the generator load,
 * PR #195).
 *
 * The Transformers.js pipeline is stubbed via `../runtime.ts`, so these pin
 * the state machine and the bounded wait, NOT real browser WASM / model
 * behaviour (UNVERIFIED in CI).
 *
 * Contract (the values are UNVERIFIED defaults, chosen for the embedder —
 * NOT copied from R-02's 120 s / 60 s, which were tuned for the generator's
 * ~750 MB remote download; the embedder is ~23 MB same-origin):
 *   - loadSemantic(): settles null at 30 s if the load never settles, phase
 *     `failed`, and the wedged promise is reset so a second call retries.
 *   - a load that settles before the bound resolves `ready`.
 *   - semantic.embed(): rejects at 12 s if the extractor never settles
 *     (the panel's per-turn patience, SEMANTIC_WAIT_MS in QaChatPanel.tsx),
 *     so the caller can fall back to the keyword pipeline.
 */

const loadPipeline = vi.hoisted(() => vi.fn());

vi.mock('../runtime.ts', () => ({
  loadPipeline: (...args: unknown[]) => loadPipeline(...args),
}));

// Mirrors SEMANTIC_LOAD_TIMEOUT_MS in embedder.ts (cf. inference.readiness.test.ts
// mirroring FIRST_PROGRESS_TIMEOUT_MS / STALL_TIMEOUT_MS the same way).
const LOAD_MS = 30_000;
// Mirrors EMBED_TIMEOUT_MS in embedder.ts.
const EMBED_MS = 12_000;

const rawIndex = {
  version: 1,
  model: 'all-MiniLM-L6-v2',
  dims: 2,
  content: 'test',
  chunks: [],
  chunkVectors: { data: '', scales: [] },
  intents: [],
  intentVectors: { data: '', scales: [] },
};

const extractor = vi.fn(async () => ({ data: new Float32Array([3, 4]) }));

const load = async () => import('./embedder.ts');

/** Resolves to 'settled' or 'pending' without waiting on a promise that may never settle. */
async function state(p: Promise<unknown>): Promise<'settled' | 'pending'> {
  let settled = false;
  void p.then(
    () => (settled = true),
    () => (settled = true),
  );
  await vi.advanceTimersByTimeAsync(0);
  return settled ? 'settled' : 'pending';
}

function phases(mod: Awaited<ReturnType<typeof load>>): string[] {
  const seen: string[] = [];
  mod.subscribeSemantic((next) => seen.push(next));
  return seen;
}

beforeEach(() => {
  vi.useFakeTimers();
  loadPipeline.mockReset();
  extractor.mockClear();
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => rawIndex })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('embedder bounded wait: a load that never settles', () => {
  it('a loadPipeline() that never settles settles null at 30 s, not before, phase failed', async () => {
    loadPipeline.mockImplementation(() => new Promise(() => {}));
    const mod = await load();
    const seen = phases(mod);
    const result = mod.loadSemantic();
    await vi.advanceTimersByTimeAsync(LOAD_MS - 1);
    expect(await state(result)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(await state(result)).toBe('settled');
    expect(await result).toBeNull();
    expect(seen).toContain('failed');
  });

  it('an index fetch that never settles also settles null at 30 s, phase failed', async () => {
    loadPipeline.mockResolvedValue(extractor);
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const mod = await load();
    const seen = phases(mod);
    const result = mod.loadSemantic();
    await vi.advanceTimersByTimeAsync(LOAD_MS);
    expect(await result).toBeNull();
    expect(seen).toContain('failed');
  });

  it('a second loadSemantic() call after the timeout re-invokes the load (retry unwedged)', async () => {
    loadPipeline.mockImplementation(() => new Promise(() => {}));
    const mod = await load();
    const first = mod.loadSemantic();
    await vi.advanceTimersByTimeAsync(LOAD_MS);
    expect(await first).toBeNull();
    loadPipeline.mockResolvedValue(extractor);
    const second = await mod.loadSemantic();
    expect(loadPipeline).toHaveBeenCalledTimes(2);
    expect(second).not.toBeNull();
    expect(phases(mod)).toContain('ready');
  });

  it('a late resolve after the timeout never flips the phase to ready', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    loadPipeline.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const mod = await load();
    const seen = phases(mod);
    const result = mod.loadSemantic();
    await vi.advanceTimersByTimeAsync(LOAD_MS);
    expect(await result).toBeNull();
    seen.length = 0;
    resolveLoad(extractor);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).not.toContain('ready');
    expect(phases(mod)).toContain('failed');
  });
});

describe('embedder load that settles in time', () => {
  it('a load that settles before the bound resolves ready and embed() works', async () => {
    loadPipeline.mockResolvedValue(extractor);
    const mod = await load();
    const semantic = await mod.loadSemantic();
    expect(semantic).not.toBeNull();
    expect(phases(mod)).toContain('ready');
    const vector = await semantic!.embed('what is a cache');
    expect(vector).toHaveLength(2);
    expect(vector[0]).toBeCloseTo(0.6);
    expect(vector[1]).toBeCloseTo(0.8);
  });

  it('a rejected load settles null with phase failed and a later call retries', async () => {
    loadPipeline.mockRejectedValue(new Error('wasm 404'));
    const mod = await load();
    expect(await mod.loadSemantic()).toBeNull();
    expect(phases(mod)).toContain('failed');
    loadPipeline.mockResolvedValue(extractor);
    expect(await mod.loadSemantic()).not.toBeNull();
    expect(loadPipeline).toHaveBeenCalledTimes(2);
  });
});

describe('post-ready embed() bound', () => {
  it('an extractor that never settles makes embed() reject at 12 s, not hang', async () => {
    loadPipeline.mockResolvedValue(() => new Promise(() => {}));
    const mod = await load();
    const semantic = await mod.loadSemantic();
    expect(semantic).not.toBeNull();
    const embedded = semantic!.embed('what is a cache');
    const watched = embedded.then(
      () => 'resolved',
      () => 'rejected',
    );
    await vi.advanceTimersByTimeAsync(EMBED_MS - 1);
    expect(await state(embedded)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(await watched).toBe('rejected');
  });
});
