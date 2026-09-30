import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { memoryStorage, stubBrowserStorage } from '../test-utils/memoryStorage';

const storage = stubBrowserStorage();
const sessionBacking = memoryStorage();
(globalThis as unknown as { sessionStorage: ReturnType<typeof memoryStorage> }).sessionStorage =
  sessionBacking;

let useSessionStore: (typeof import('./session'))['useSessionStore'];
let useProgressStore: (typeof import('./progress'))['useProgressStore'];

beforeAll(async () => {
  ({ useSessionStore } = await import('./session'));
  ({ useProgressStore } = await import('./progress'));
});

beforeEach(() => {
  storage.clear();
  sessionBacking.clear();
  useSessionStore.setState({
    githubLogin: null,
    gistId: null,
    accessToken: null,
    lastSyncedAt: null,
    progressRev: 0,
    pausedAt: null,
    dirty: false,
  });
  useProgressStore.setState({
    completedLessons: ['kept'],
    quizResults: {},
    seenBadges: [],
    celebratedBadges: [],
  });
});

describe('session store', () => {
  it('is signed out by default', () => {
    expect(useSessionStore.getState().isSignedIn()).toBe(false);
  });

  it('setSession signs in', () => {
    useSessionStore.getState().setSession({
      githubLogin: 'veer',
      gistId: 'g1',
      accessToken: 'tok',
    });
    expect(useSessionStore.getState().isSignedIn()).toBe(true);
    expect(sessionBacking.getItem('sdm-gh-token')).toBe('tok');
  });

  it('clearSession drops identity and keeps progress', () => {
    useSessionStore.getState().setSession({
      githubLogin: 'veer',
      gistId: 'g1',
      accessToken: 'tok',
    });
    useSessionStore.getState().clearSession();
    expect(useSessionStore.getState().isSignedIn()).toBe(false);
    expect(useProgressStore.getState().completedLessons).toContain('kept');
    expect(sessionBacking.getItem('sdm-gh-token')).toBeNull();
  });

  it('pause then resume', () => {
    useSessionStore.getState().pause();
    expect(useSessionStore.getState().pausedAt).not.toBeNull();
    useSessionStore.getState().resume();
    expect(useSessionStore.getState().pausedAt).toBeNull();
  });
});
