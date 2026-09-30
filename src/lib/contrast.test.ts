import { describe, expect, it } from 'vitest';
import { AA_NORMAL_TEXT, roundedRatio, STONE } from './contrast';

/**
 * Pins the P1-8 label-text contrast fixes with first-hand computed ratios
 * (WCAG 2.1, normal text needs ≥ 4.5:1). Each case names the element, the
 * foreground/background pair, and the ratio the fix achieves.
 */
describe('P1-8 label contrast (WCAG AA, normal text)', () => {
  const cases: Array<[string, string, string, number]> = [
    // [element, fg class color, bg color, minimum expected ratio]
    ['breadcrumb (light)', STONE.stone500, STONE.stone50, 4.59],
    ['"On this page" rail (light)', STONE.stone500, STONE.stone50, 4.59],
    ['sidebar tier counts (light)', STONE.stone500, STONE.stone50, 4.59],
    ['prev/next eyebrows (light)', STONE.stone500, STONE.white, 4.8],
    ['sidebar progress % (light)', STONE.stone500, STONE.white, 4.8],
    ['breadcrumb / rail / tier counts (dark)', STONE.stone400, STONE.stone950, 7.8],
    ['prev/next eyebrows / % (dark)', STONE.stone400, STONE.stone900, 6.9],
  ];

  for (const [label, fg, bg, min] of cases) {
    it(`${label} meets 4.5:1 (${fg} on ${bg})`, () => {
      const ratio = roundedRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(ratio).toBeGreaterThanOrEqual(min);
    });
  }

  it('documents the pre-fix failures so the fix cannot silently regress', () => {
    // stone-400 labels on the light page/card backgrounds failed AA…
    expect(roundedRatio(STONE.stone400, STONE.stone50)).toBeLessThan(AA_NORMAL_TEXT);
    expect(roundedRatio(STONE.stone400, STONE.white)).toBeLessThan(AA_NORMAL_TEXT);
    // …and the old dark-mode eyebrow color failed on the dark card too.
    expect(roundedRatio(STONE.stone500, STONE.stone900)).toBeLessThan(AA_NORMAL_TEXT);
  });
});
