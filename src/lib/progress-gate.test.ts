import { describe, expect, it, vi } from 'vitest';

// progress-gate imports ./lessons, which eagerly loads all 36 MDX modules.
// Mock the catalog with a small fixture so these tests stay fast and
// deterministic, and keep testing the gating logic, not the content.
vi.mock('./lessons', () => ({
  lessons: [
    { meta: { slug: 'a1', title: 'A1', tier: 'beginner', order: 1 }, Component: () => null },
    { meta: { slug: 'a2', title: 'A2', tier: 'beginner', order: 2 }, Component: () => null },
    { meta: { slug: 'b1', title: 'B1', tier: 'intermediate', order: 3 }, Component: () => null },
    { meta: { slug: 'c1', title: 'C1', tier: 'advanced', order: 4 }, Component: () => null },
  ],
  tierOrder: ['beginner', 'intermediate', 'advanced'],
  tierLabels: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
}));

import { isLessonUnlocked, isTierUnlocked } from './progress-gate';

describe('isTierUnlocked', () => {
  it('beginner is always unlocked', () => {
    expect(isTierUnlocked('beginner', [])).toBe(true);
  });

  it('intermediate is locked until every beginner lesson is complete', () => {
    expect(isTierUnlocked('intermediate', [])).toBe(false);
    expect(isTierUnlocked('intermediate', ['a1'])).toBe(false);
    expect(isTierUnlocked('intermediate', ['a1', 'a2'])).toBe(true);
  });

  it('advanced requires the full intermediate tier', () => {
    expect(isTierUnlocked('advanced', ['a1', 'a2'])).toBe(false);
    expect(isTierUnlocked('advanced', ['a1', 'a2', 'b1'])).toBe(true);
  });

  it('extra completed slugs do not affect gating', () => {
    expect(isTierUnlocked('intermediate', ['a1', 'a2', 'whatever'])).toBe(true);
  });
});

describe('isLessonUnlocked', () => {
  it('returns false for unknown slugs', () => {
    expect(isLessonUnlocked('nope', ['a1', 'a2', 'b1', 'c1'])).toBe(false);
  });

  it('follows the lesson tier', () => {
    expect(isLessonUnlocked('b1', ['a1', 'a2'])).toBe(true);
    expect(isLessonUnlocked('b1', ['a1'])).toBe(false);
    expect(isLessonUnlocked('c1', ['a1', 'a2', 'b1'])).toBe(true);
  });
});
