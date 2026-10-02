import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { stubBrowserStorage } from '../test-utils/memoryStorage';

const storage = stubBrowserStorage();

let mod: typeof import('./listenPosition');
const KEY = 'sdm-listen-position';

beforeAll(async () => {
  mod = await import('./listenPosition');
});

beforeEach(() => {
  storage.clear();
  mod.useListenPositionStore.setState({ positions: {} });
});

const persisted = () => JSON.parse(storage.getItem(KEY) ?? 'null');

describe('position reducers', () => {
  it('sanitizePositions keeps only positive integer indices', () => {
    expect(
      mod.sanitizePositions({ a: 3, b: 0, c: -2, d: 1.5, e: '4', f: null, g: NaN, '': 2, h: 7 }),
    ).toEqual({ a: 3, h: 7 });
  });

  it('sanitizePositions rejects non-objects', () => {
    for (const bad of [null, undefined, 'x', 5, [], [1, 2], true]) {
      expect(mod.sanitizePositions(bad)).toEqual({});
    }
  });

  it('sanitizePositions keeps __proto__ as inert data', () => {
    const raw = JSON.parse('{"__proto__": 3, "ok": 2}');
    const out = mod.sanitizePositions(raw);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.ok).toBe(2);
  });

  it('sanitizePositions caps how many lessons it remembers', () => {
    const raw = Object.fromEntries(
      Array.from({ length: mod.MAX_TRACKED_LESSONS + 25 }, (_, i) => [`l${i}`, 1]),
    );
    expect(Object.keys(mod.sanitizePositions(raw))).toHaveLength(mod.MAX_TRACKED_LESSONS);
  });

  it('positionFor ignores inherited keys', () => {
    expect(mod.positionFor({}, 'constructor')).toBeUndefined();
    expect(mod.positionFor({ x: 4 }, 'x')).toBe(4);
  });

  it('withPosition returns the same map when unchanged', () => {
    const m = { a: 2 };
    expect(mod.withPosition(m, 'a', 2)).toBe(m);
    expect(mod.withPosition(m, 'a', 5)).toEqual({ a: 5 });
    expect(m).toEqual({ a: 2 });
  });

  it('withPosition clears on the first block or an invalid index', () => {
    expect(mod.withPosition({ a: 2 }, 'a', 0)).toEqual({});
    expect(mod.withPosition({ a: 2 }, 'a', -1)).toEqual({});
    expect(mod.withPosition({ a: 2 }, 'a', Number.NaN)).toEqual({});
    const empty = {};
    expect(mod.withPosition(empty, 'a', 0)).toBe(empty);
  });

  it('withPosition evicts the oldest entry at the cap, never the new one', () => {
    const full = Object.fromEntries(
      Array.from({ length: mod.MAX_TRACKED_LESSONS }, (_, i) => [`l${i}`, 1]),
    );
    const next = mod.withPosition(full, 'fresh', 4);
    expect(Object.keys(next)).toHaveLength(mod.MAX_TRACKED_LESSONS);
    expect(next.fresh).toBe(4);
    expect('l0' in next).toBe(false);
  });

  it('withoutPosition is a no-op for an unknown slug', () => {
    const m = { a: 2 };
    expect(mod.withoutPosition(m, 'zzz')).toBe(m);
    expect(mod.withoutPosition(m, 'a')).toEqual({});
  });
});

describe('listen position store', () => {
  it('starts empty', () => {
    expect(mod.useListenPositionStore.getState().positions).toEqual({});
  });

  it('records a position per lesson and persists it versioned', () => {
    const s = mod.useListenPositionStore.getState();
    s.setPosition('caching', 6);
    s.setPosition('cdn', 2);
    expect(mod.useListenPositionStore.getState().positions).toEqual({ caching: 6, cdn: 2 });
    expect(persisted()).toEqual({
      state: { positions: { caching: 6, cdn: 2 } },
      version: mod.LISTEN_POSITION_VERSION,
    });
  });

  it('does not rewrite storage when the position is unchanged', () => {
    mod.useListenPositionStore.getState().setPosition('caching', 6);
    const before = storage.getItem(KEY);
    let writes = 0;
    const setItem = storage.setItem;
    storage.setItem = (k, v) => {
      writes += 1;
      setItem(k, v);
    };
    mod.useListenPositionStore.getState().setPosition('caching', 6);
    storage.setItem = setItem;
    expect(writes).toBe(0);
    expect(storage.getItem(KEY)).toBe(before);
  });

  it('clearPosition forgets one lesson only', () => {
    const s = mod.useListenPositionStore.getState();
    s.setPosition('a', 3);
    s.setPosition('b', 4);
    s.clearPosition('a');
    expect(mod.useListenPositionStore.getState().positions).toEqual({ b: 4 });
  });

  it('setPosition(0) clears (the start is not a resume point)', () => {
    const s = mod.useListenPositionStore.getState();
    s.setPosition('a', 3);
    s.setPosition('a', 0);
    expect(mod.useListenPositionStore.getState().positions).toEqual({});
  });
});

describe('rehydration tolerates bad storage', () => {
  const rehydrate = async () => {
    await mod.useListenPositionStore.persist.rehydrate();
    return mod.useListenPositionStore.getState().positions;
  };

  it('round-trips valid data', async () => {
    storage.setItem(KEY, JSON.stringify({ state: { positions: { a: 5 } }, version: 1 }));
    expect(await rehydrate()).toEqual({ a: 5 });
  });

  it('ignores invalid JSON', async () => {
    storage.setItem(KEY, '{not json');
    expect(await rehydrate()).toEqual({});
  });

  it('drops garbage entries but keeps the good ones', async () => {
    storage.setItem(
      KEY,
      JSON.stringify({
        state: { positions: { good: 3, neg: -1, str: 'x', frac: 2.5, nul: null } },
        version: 1,
      }),
    );
    expect(await rehydrate()).toEqual({ good: 3 });
  });

  it('survives wrong shapes at every level', async () => {
    for (const blob of [
      'null',
      '5',
      '"str"',
      '[]',
      '{}',
      JSON.stringify({ state: null, version: 1 }),
      JSON.stringify({ state: 'x', version: 1 }),
      JSON.stringify({ state: { positions: [1, 2] }, version: 1 }),
      JSON.stringify({ state: { positions: 'oops' }, version: 1 }),
    ]) {
      storage.setItem(KEY, blob);
      expect(await rehydrate()).toEqual({});
      expect(typeof mod.useListenPositionStore.getState().setPosition).toBe('function');
    }
  });

  it('migrates an unversioned or older blob through the sanitizer', async () => {
    storage.setItem(KEY, JSON.stringify({ state: { positions: { old: 4, bad: 0 } } }));
    expect(await rehydrate()).toEqual({ old: 4 });
    storage.setItem(KEY, JSON.stringify({ state: { positions: { older: 2 } }, version: 0 }));
    expect(await rehydrate()).toEqual({ older: 2 });
  });

  it('accepts a blob from a future version without crashing', async () => {
    storage.setItem(KEY, JSON.stringify({ state: { positions: { f: 9 } }, version: 99 }));
    expect(await rehydrate()).toEqual({ f: 9 });
  });
});
