import { describe, expect, it } from 'vitest';
import { quotaLabel } from './quota';

/**
 * The quota badge is the only quota logic that lives in the widget: it must
 * stay hidden until the first turn mints a session, count down honestly, and
 * name the terminal state instead of showing "0 left today".
 */
describe('quotaLabel', () => {
  it('returns null before the first turn (no session yet)', () => {
    expect(quotaLabel(null)).toBeNull();
  });

  it('shows remaining questions', () => {
    expect(quotaLabel({ limit: 50, remaining: 49, resetAt: 'x' })).toBe('49 left today');
    expect(quotaLabel({ limit: 50, remaining: 1, resetAt: 'x' })).toBe('1 left today');
  });

  it('names the exhausted state', () => {
    expect(quotaLabel({ limit: 50, remaining: 0, resetAt: 'x' })).toBe('Daily limit reached');
  });
});
