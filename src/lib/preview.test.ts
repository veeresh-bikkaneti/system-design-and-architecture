import { describe, expect, it, vi } from 'vitest';

vi.mock('./lessons', () => ({
  lessons: [
    { meta: { slug: 'a1', title: 'A1', tier: 'beginner', order: 1 }, Component: () => null },
    { meta: { slug: 'a2', title: 'A2', tier: 'beginner', order: 2 }, Component: () => null },
    { meta: { slug: 'b1', title: 'B1', tier: 'intermediate', order: 3 }, Component: () => null },
  ],
  tierOrder: ['beginner', 'intermediate', 'advanced'],
  tierLabels: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
}));

import { getPreviewSlug, isPreviewSlug } from './preview';
import { canOpenLesson } from './progress-gate';

describe('preview slug', () => {
  it('preview slug is the lowest order lesson', () => {
    expect(getPreviewSlug()).toBe('a1');
  });

  it('isPreviewSlug matches only that lesson', () => {
    expect(isPreviewSlug('a1')).toBe(true);
    expect(isPreviewSlug('a2')).toBe(false);
  });
});

describe('canOpenLesson', () => {
  it('logged out may only open the preview slug', () => {
    expect(canOpenLesson('a1', [], false)).toBe(true);
    expect(canOpenLesson('a2', [], false)).toBe(false);
    expect(canOpenLesson('b1', ['a1', 'a2'], false)).toBe(false);
  });

  it('signed in still uses the existing tier gate', () => {
    expect(canOpenLesson('a2', [], true)).toBe(true);
    expect(canOpenLesson('b1', [], true)).toBe(false);
    expect(canOpenLesson('b1', ['a1', 'a2'], true)).toBe(true);
  });
});
