import { describe, expect, it, vi } from 'vitest';

// badges.ts derives everything from the lesson catalog; mock it with a small
// fixture so the unlock rules are tested, not the content.
vi.mock('./lessons', () => ({
  lessons: [
    { meta: { slug: 'a1', title: 'A1', tier: 'beginner', order: 1 }, Component: () => null },
    { meta: { slug: 'a2', title: 'A2', tier: 'beginner', order: 2 }, Component: () => null },
    { meta: { slug: 'b1', title: 'B1', tier: 'intermediate', order: 3 }, Component: () => null },
  ],
  tierOrder: ['beginner', 'intermediate', 'advanced'],
  tierLabels: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
}));

import {
  getAllBadges,
  getBadgeById,
  getBadgesWithStatus,
  isBadgeUnlocked,
  type ProgressSnapshot,
} from './badges';

const empty: ProgressSnapshot = { completedLessons: [], quizResults: {} };

describe('getAllBadges', () => {
  it('derives one course badge, one tier badge per non-empty tier, two per lesson', () => {
    const badges = getAllBadges();
    // 1 course + 2 tiers (beginner, intermediate; advanced is empty) + 3*2 lesson badges
    expect(badges).toHaveLength(9);
    const ids = badges.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length); // ids unique
  });
});

describe('isBadgeUnlocked', () => {
  it('course badge needs every lesson', () => {
    const badge = getBadgeById('course-complete')!;
    expect(isBadgeUnlocked(badge, empty)).toBe(false);
    expect(
      isBadgeUnlocked(badge, { completedLessons: ['a1', 'a2', 'b1'], quizResults: {} }),
    ).toBe(true);
  });

  it('tier badge needs every lesson in that tier', () => {
    const badge = getBadgeById('tier-beginner')!;
    expect(isBadgeUnlocked(badge, { completedLessons: ['a1'], quizResults: {} })).toBe(false);
    expect(
      isBadgeUnlocked(badge, { completedLessons: ['a1', 'a2'], quizResults: {} }),
    ).toBe(true);
  });

  it('lesson badge unlocks on completion', () => {
    const badge = getBadgeById('lesson-b1')!;
    expect(isBadgeUnlocked(badge, empty)).toBe(false);
    expect(
      isBadgeUnlocked(badge, { completedLessons: ['b1'], quizResults: {} }),
    ).toBe(true);
  });

  it('quiz-ace needs a perfect, passing score', () => {
    const badge = getBadgeById('quiz-ace-a1')!;
    expect(isBadgeUnlocked(badge, empty)).toBe(false);
    expect(
      isBadgeUnlocked(badge, {
        completedLessons: [],
        quizResults: { a1: { correct: 4, total: 5, passed: false } },
      }),
    ).toBe(false);
    expect(
      isBadgeUnlocked(badge, {
        completedLessons: [],
        quizResults: { a1: { correct: 5, total: 5, passed: true } },
      }),
    ).toBe(true);
    // Degenerate quiz (no questions) can never be "aced".
    expect(
      isBadgeUnlocked(badge, {
        completedLessons: [],
        quizResults: { a1: { correct: 0, total: 0, passed: false } },
      }),
    ).toBe(false);
  });
});

describe('getBadgesWithStatus', () => {
  it('marks each badge with its unlock state', () => {
    const withStatus = getBadgesWithStatus({
      completedLessons: ['a1'],
      quizResults: {},
    });
    const byId = Object.fromEntries(withStatus.map((b) => [b.id, b.unlocked]));
    expect(byId['lesson-a1']).toBe(true);
    expect(byId['lesson-a2']).toBe(false);
    expect(byId['course-complete']).toBe(false);
  });
});
