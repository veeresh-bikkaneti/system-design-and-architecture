/**
 * Tests for the shared player chrome (src/components/player/PlayerChrome.tsx).
 *
 * P1-12 extracted the verbatim-duplicated chrome out of ListenButton and
 * NeuralPlayer (LessonNarrator.tsx) — SPEEDS, pillClass, segmentClass, and
 * the options-popover outside-click/Escape dismiss — into this one module.
 * These tests pin the shared recipe (so the two players can't drift apart
 * again) and assert the duplication is actually gone from both players.
 *
 * P0-5 (player-swap race) needed no code change: the lazy-probe flow
 * renders an inert pill — never a playing ListenButton — while the
 * manifest is unresolved, so no unmount can cancel speech mid-sentence.
 * The invariant is documented on the LessonNarrator branch; there is no
 * hook or component small enough to unit-test it in this Node-only suite.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pillClass, segmentClass, SPEEDS } from './PlayerChrome';

describe('PlayerChrome shared recipe', () => {
  it('offers the four playback speeds both players share', () => {
    expect([...SPEEDS]).toEqual([0.9, 1, 1.25, 1.5]);
  });

  it('pillClass is the secondary-header-action pill recipe', () => {
    expect(typeof pillClass).toBe('string');
    for (const token of [
      'inline-flex',
      'border-stone-200/80',
      'bg-white',
      'text-stone-600',
      'shadow-soft',
      'dark:border-stone-700',
      'dark:bg-stone-900',
      'dark:text-stone-300',
    ]) {
      expect(pillClass).toContain(token);
    }
  });

  it('segmentClass renders the active segment distinctly from inactive', () => {
    const active = segmentClass(true);
    const inactive = segmentClass(false);
    // Shared shape.
    for (const cls of [active, inactive]) {
      expect(cls).toContain('rounded-full');
      expect(cls).toContain('text-xs font-semibold');
    }
    // Active state pops; inactive is legible secondary text (stone-500 on
    // white = 4.80:1, WCAG AA).
    expect(active).toContain('bg-accent-700');
    expect(active).toContain('text-white');
    expect(inactive).toContain('text-stone-500');
    expect(inactive).not.toContain('bg-accent-700');
  });
});

describe('no duplicated player chrome in the players (P1-12)', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const sources = {
    'ListenButton.tsx': readFileSync(resolve(dir, '../ListenButton.tsx'), 'utf8'),
    'LessonNarrator.tsx': readFileSync(resolve(dir, '../LessonNarrator.tsx'), 'utf8'),
  };

  it.each(Object.keys(sources))('%s consumes the shared module', (name) => {
    expect(sources[name]).toContain('./player/PlayerChrome');
  });

  it.each(Object.keys(sources))(
    '%s defines none of the extracted chrome itself',
    (name) => {
      const src = sources[name];
      expect(src).not.toContain('const SPEEDS =');
      expect(src).not.toContain('const pillClass =');
      expect(src).not.toContain('const segmentClass =');
      // The outside-click/Escape popover dismiss lives in usePopoverDismiss.
      expect(src).not.toContain("addEventListener('pointerdown'");
      expect(src).not.toContain("addEventListener('keydown'");
    },
  );
});
