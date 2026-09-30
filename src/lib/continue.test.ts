import { beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage, stubBrowserStorage } from '../test-utils/memoryStorage';

stubBrowserStorage();
(globalThis as unknown as { sessionStorage: ReturnType<typeof memoryStorage> }).sessionStorage =
  memoryStorage();

vi.mock('./lessons', () => ({
  lessons: [
    { meta: { slug: 'a1', order: 1 } },
    { meta: { slug: 'a2', order: 2 } },
    { meta: { slug: 'b1', order: 3 } },
  ],
}));

let nextUnfinishedSlug: (typeof import('./continue'))['nextUnfinishedSlug'];
let requireSignInToMutate: (typeof import('./continue'))['requireSignInToMutate'];
let useSessionStore: (typeof import('../store/session'))['useSessionStore'];

beforeAll(async () => {
  ({ useSessionStore } = await import('../store/session'));
  ({ nextUnfinishedSlug, requireSignInToMutate } = await import('./continue'));
});

describe('continue helpers', () => {
  it('picks the first unfinished syllabus slug', () => {
    expect(nextUnfinishedSlug([])).toBe('a1');
    expect(nextUnfinishedSlug(['a1'])).toBe('a2');
    expect(nextUnfinishedSlug(['a1', 'a2', 'b1'])).toBeNull();
  });

  it('mutate requires login when signed out', () => {
    useSessionStore.setState({ accessToken: null, githubLogin: null });
    expect(requireSignInToMutate()).toBe(true);
    useSessionStore.setState({ accessToken: 't', githubLogin: 'veer' });
    expect(requireSignInToMutate()).toBe(false);
  });
});
