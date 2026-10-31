// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgressStore } from '../store/progress';
import { useSessionStore } from '../store/session';
import { pullAndMerge, syncNow } from './gist-sync';
import { startIdleWatch, SYNC_TICK_MS } from './idle';
import type { ProgressSnapshot } from './progress-merge';

const GIST_ID = 'gist-1';
const TOKEN = 'token-1';
const LAST_SYNCED_AT = 1000;

const REMOTE_SNAP: ProgressSnapshot = {
  completedLessons: ['remote-lesson'],
  quizResults: {},
  seenBadges: [],
  celebratedBadges: [],
  updatedAt: '2025-01-01T00:00:00.000Z',
  rev: 5,
};

function gistDetail() {
  return {
    id: GIST_ID,
    files: {
      'sdm-progress.json': { content: JSON.stringify(REMOTE_SNAP), filename: 'sdm-progress.json' },
    },
  };
}

type PatchBehavior = 'ok' | 'error500' | 'error401' | 'reject';

/** Mock fetch: GET gist detail always succeeds; PATCH follows `patch`. */
function makeFetch(patch: PatchBehavior) {
  const calls: Array<{ url: string; method: string | undefined }> = [];
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method;
    calls.push({ url, method });
    if (method === 'PATCH') {
      if (patch === 'reject') throw new Error('network down');
      if (patch === 'error500') {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      if (patch === 'error401') {
        return { ok: false, status: 401, json: async () => ({}) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }
    if (url.endsWith(`/gists/${GIST_ID}`)) {
      return { ok: true, status: 200, json: async () => gistDetail() } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${method ?? 'GET'} ${url}`);
  });
  return { mock, calls };
}

function signIn() {
  useSessionStore.setState({
    githubLogin: 'tester',
    gistId: GIST_ID,
    accessToken: TOKEN,
    pausedAt: null,
    dirty: true,
    lastSyncedAt: LAST_SYNCED_AT,
    progressRev: 3,
    loginPrompt: false,
  });
  useProgressStore.setState({
    completedLessons: ['local-lesson'],
    quizResults: {},
    seenBadges: [],
    celebratedBadges: [],
  });
}

beforeEach(() => {
  signIn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('sync core (T-PWA-4a)', () => {
  it('pull-ok-push-500-keeps-dirty', async () => {
    const first = makeFetch('error500');
    vi.stubGlobal('fetch', first.mock);
    await expect(syncNow()).rejects.toThrow('github 500');
    const afterFail = useSessionStore.getState();
    expect(afterFail.dirty).toBe(true);
    expect(afterFail.lastSyncedAt).toBe(LAST_SYNCED_AT);
    expect(afterFail.accessToken).toBe(TOKEN);
    expect(afterFail.pausedAt).toBeNull();

    // Second attempt must re-attempt the push, not early-return.
    const second = makeFetch('ok');
    vi.stubGlobal('fetch', second.mock);
    await syncNow();
    expect(second.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(useSessionStore.getState().dirty).toBe(false);
  });

  it('pull-ok-push-offline-preserves', async () => {
    const { mock } = makeFetch('reject');
    vi.stubGlobal('fetch', mock);
    await expect(syncNow()).rejects.toThrow('network down');
    const s = useSessionStore.getState();
    expect(s.accessToken).toBe(TOKEN);
    expect(s.pausedAt).toBeNull();
    expect(s.dirty).toBe(true);
    expect(s.lastSyncedAt).toBe(LAST_SYNCED_AT);
    // Merged local progress is preserved (union), not clobbered.
    expect(useProgressStore.getState().completedLessons).toEqual([
      'local-lesson',
      'remote-lesson',
    ]);
  });

  it('push-401-keeps-dirty', async () => {
    const { mock } = makeFetch('error401');
    vi.stubGlobal('fetch', mock);
    await expect(syncNow()).rejects.toThrow('github 401');
    const s = useSessionStore.getState();
    expect(s.dirty).toBe(true);
    expect(s.lastSyncedAt).toBe(LAST_SYNCED_AT);
    expect(s.pausedAt).not.toBeNull();
    expect(s.accessToken).toBeNull();
  });

  it('pat-sequence-pushes-then-cleans', async () => {
    const { mock, calls } = makeFetch('ok');
    vi.stubGlobal('fetch', mock);
    await pullAndMerge(TOKEN, GIST_ID);
    // Pull must not mark clean.
    expect(useSessionStore.getState().dirty).toBe(true);
    await syncNow();
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    const s = useSessionStore.getState();
    expect(s.dirty).toBe(false);
    expect(s.lastSyncedAt).not.toBe(LAST_SYNCED_AT);
  });

  it('guard: push-success marks clean and advances lastSyncedAt', async () => {
    const { mock } = makeFetch('ok');
    vi.stubGlobal('fetch', mock);
    await syncNow();
    const s = useSessionStore.getState();
    expect(s.dirty).toBe(false);
    expect(s.lastSyncedAt).not.toBe(LAST_SYNCED_AT);
  });

  it('guard: real 401 still pauses and clears token', async () => {
    const { mock } = makeFetch('error401');
    vi.stubGlobal('fetch', mock);
    await expect(syncNow()).rejects.toThrow('github 401');
    const s = useSessionStore.getState();
    expect(s.pausedAt).not.toBeNull();
    expect(s.accessToken).toBeNull();
  });
});

describe('idle background sync failure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('idle-rejecting-sync-no-unhandled-rejection', async () => {
    // No-unhandled-rejection gate, read carefully. Probed this session
    // (scratch probe file, deleted after): neither a process nor a window
    // 'unhandledrejection' listener fires inside this vitest/jsdom worker
    // — vitest intercepts unhandled rejections itself and reports them as
    // run errors. So a listener assertion would pass vacuously here. The
    // gate is therefore run-level: on the old tree this scenario makes
    // vitest report "Unhandled Errors: 1 error" and fail the file; after
    // the fix the run is clean with zero unhandled errors. The assertions
    // below prove the behavioural half: the rejecting tick neither throws
    // to its caller nor kills the loop — a later tick still syncs.
    // The fetch mock rejects every call, so the failure happens at pull
    // and dirty is untouched on both trees: the ONLY old/new difference
    // in this scenario is whether the rejection is swallowed.
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    const stop = startIdleWatch(() => 0);
    try {
      // First branch of tick fires syncNow regardless of idle time.
      await vi.advanceTimersByTimeAsync(SYNC_TICK_MS);
      const succeeding = makeFetch('ok');
      vi.stubGlobal('fetch', succeeding.mock);
      await vi.advanceTimersByTimeAsync(SYNC_TICK_MS);
      expect(succeeding.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    } finally {
      stop();
    }
  });
});
