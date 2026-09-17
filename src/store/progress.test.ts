import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { stubBrowserStorage } from '../test-utils/memoryStorage';

// The store persists via zustand/middleware -> window.localStorage, which
// does not exist in the node test env. Stub it before the module loads.
const storage = stubBrowserStorage();

let useProgressStore: (typeof import('./progress'))['useProgressStore'];
let QUIZ_PASS_THRESHOLD: number;

beforeAll(async () => {
  ({ useProgressStore, QUIZ_PASS_THRESHOLD } = await import('./progress'));
});

beforeEach(() => {
  storage.clear();
  useProgressStore.setState({
    completedLessons: [],
    quizResults: {},
    seenBadges: [],
    celebratedBadges: [],
  });
});

describe('quiz pass threshold', () => {
  it('is 0.7 and matches the worker exam threshold', () => {
    expect(QUIZ_PASS_THRESHOLD).toBe(0.7);
  });

  it('exactly 0.7 passes (7/10)', () => {
    useProgressStore.getState().recordQuizResult('a1', 7, 10);
    const result = useProgressStore.getState().quizResults['a1'];
    expect(result.passed).toBe(true);
    // Passing marks the lesson complete.
    expect(useProgressStore.getState().completedLessons).toContain('a1');
  });

  it('just below 0.7 fails and does not complete the lesson (6/10)', () => {
    useProgressStore.getState().recordQuizResult('a1', 6, 10);
    const result = useProgressStore.getState().quizResults['a1'];
    expect(result.passed).toBe(false);
    expect(useProgressStore.getState().completedLessons).not.toContain('a1');
  });

  it('a quiz with no questions cannot pass', () => {
    useProgressStore.getState().recordQuizResult('a1', 0, 0);
    expect(useProgressStore.getState().quizResults['a1'].passed).toBe(false);
  });
});

describe('completion tracking', () => {
  it('markComplete is idempotent', () => {    const { markComplete } = useProgressStore.getState();
    markComplete('a1');
    markComplete('a1');
    expect(useProgressStore.getState().completedLessons).toEqual(['a1']);
  });

  it('markIncomplete removes the lesson', () => {
    const { markComplete, markIncomplete } = useProgressStore.getState();
    markComplete('a1');
    markIncomplete('a1');
    expect(useProgressStore.getState().isCompleted('a1')).toBe(false);
  });

  it('persists progress to storage under the sdm-progress key', () => {
    useProgressStore.getState().markComplete('a1');
    const raw = storage.getItem('sdm-progress');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.completedLessons).toContain('a1');
  });
});
