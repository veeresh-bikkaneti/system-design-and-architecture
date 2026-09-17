import { beforeAll, describe, expect, it } from 'vitest';
import { stubBrowserStorage } from '../../src/test-utils/memoryStorage';
import { EXAM_PASS_THRESHOLD, publicQuestions, scoreSubmission } from './exam';

// The frontend's QUIZ_PASS_THRESHOLD lives in a zustand store that persists
// via window.localStorage at import time; stub it so the parity assertion
// below loads the real module instead of a storage-less fallback.
stubBrowserStorage();

let QUIZ_PASS_THRESHOLD: number;
beforeAll(async () => {
  ({ QUIZ_PASS_THRESHOLD } = await import('../../src/store/progress'));
});

describe('scoreSubmission', () => {
  const allCorrect = {
    'cap-1': 0, 'cap-2': 2, 'cap-3': 1,
    'lb-1': 1, 'lb-2': 2, 'lb-3': 1,
    'part-1': 1, 'part-2': 2, 'part-3': 0,
  };

  it('scores a perfect submission', () => {
    expect(scoreSubmission(allCorrect)).toEqual({ score: 9, total: 9, passed: true });
  });

  it('6/9 fails the 0.7 threshold (0.667 < 0.7)', () => {
    const answers = { ...allCorrect, 'cap-1': 3, 'lb-1': 0, 'part-1': 0 };
    expect(scoreSubmission(answers)).toEqual({ score: 6, total: 9, passed: false });
  });

  it('7/9 passes the 0.7 threshold', () => {
    const answers = { ...allCorrect, 'cap-1': 3, 'lb-1': 0 };
    const result = scoreSubmission(answers);
    expect(result.score).toBe(7);
    expect(result.passed).toBe(true);
  });

  it('never throws on malformed submissions — bad entries just count as wrong', () => {
    for (const bad of [null, undefined, 'nope', 42, ['cap-1']]) {
      expect(scoreSubmission(bad)).toEqual({ score: 0, total: 9, passed: false });
    }
    // Wrong-typed values and unknown question ids are ignored, not fatal.
    expect(scoreSubmission({ 'cap-1': 'x', nope: 0 })).toEqual({
      score: 0, total: 9, passed: false,
    });
  });

  it('missing answers count as wrong', () => {
    expect(scoreSubmission({})).toEqual({ score: 0, total: 9, passed: false });
  });
});

describe('publicQuestions', () => {
  it('never leaks the answer key', () => {
    const questions = publicQuestions();
    expect(questions).toHaveLength(9);
    for (const q of questions) {
      expect(q).not.toHaveProperty('correctIndex');
    }
  });
});

describe('threshold parity across the trust boundary', () => {
  it('the worker exam threshold matches the frontend quiz threshold', () => {
    // If these drift, learners see "passed" while the server says "failed".
    expect(EXAM_PASS_THRESHOLD).toBe(QUIZ_PASS_THRESHOLD);
  });
});
