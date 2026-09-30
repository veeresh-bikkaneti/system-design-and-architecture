import { describe, expect, it } from 'vitest';
import { mergeProgress, type ProgressSnapshot } from './progress-merge';

function snap(partial: Partial<ProgressSnapshot>): ProgressSnapshot {
  return {
    completedLessons: [],
    quizResults: {},
    seenBadges: [],
    celebratedBadges: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    rev: 1,
    ...partial,
  };
}

describe('mergeProgress', () => {
  it('unions completed slugs', () => {
    const out = mergeProgress(
      snap({ completedLessons: ['a'], rev: 1, updatedAt: '2026-01-01T00:00:00.000Z' }),
      snap({ completedLessons: ['b'], rev: 2, updatedAt: '2026-01-02T00:00:00.000Z' }),
    );
    expect(out.completedLessons.sort()).toEqual(['a', 'b']);
  });

  it('keeps the better quiz ratio; tie uses later updatedAt', () => {
    const out = mergeProgress(
      snap({
        quizResults: { a: { correct: 2, total: 4, passed: false } },
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
      snap({
        quizResults: { a: { correct: 3, total: 4, passed: true } },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(out.quizResults.a).toEqual({ correct: 3, total: 4, passed: true });
  });

  it('rev is max(local, remote) + 1', () => {
    expect(mergeProgress(snap({ rev: 4 }), snap({ rev: 7 })).rev).toBe(8);
  });
});
