import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source-level a11y contract for the StepThrough stepper (P1-9).
 *
 * The step dots are *not* tabs: there is no tabpanel, no arrow-key
 * tablist behavior, so `role="tablist"`/`role="tab"`/`aria-selected`
 * was a pattern misuse. The dots are plain buttons with
 * `aria-current="step"`, step changes are announced through an
 * `aria-live="polite"` region, and headings nest correctly under the
 * MDX `##` (h2) sections the stepper renders inside (h3 title, h4
 * step title — never skipping levels).
 */
const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'StepThrough.tsx'),
  'utf8',
);

describe('StepThrough a11y semantics', () => {
  it('does not use the tabs pattern (no tablist / tab / aria-selected)', () => {
    expect(src).not.toMatch(/role="tablist"/);
    expect(src).not.toMatch(/role="tab"/);
    expect(src).not.toMatch(/aria-selected/);
  });

  it('marks the current step dot with aria-current="step"', () => {
    expect(src).toMatch(/aria-current=\{i === index \? 'step' : undefined\}/);
  });

  it('announces step changes through a polite live region', () => {
    expect(src).toMatch(/aria-live="polite"/);
  });

  it('nests headings under the MDX h2: h3 title, h4 step title, no skipped levels', () => {
    expect(src).toMatch(/<h3[\s>]/);
    expect(src).toMatch(/<h4[\s>]/);
    expect(src).not.toMatch(/<h5[\s>]/);
  });
});
