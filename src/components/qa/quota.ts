import type { QaQuota } from './qaApi';

/**
 * Presentational quota badge text. Null until the first turn mints a session —
 * the badge stays hidden rather than guessing. Split out of QaWidget.tsx so
 * that file only exports components (fast-refresh rule).
 */
export function quotaLabel(quota: QaQuota | null): string | null {
  if (!quota) return null;
  if (quota.remaining <= 0) return 'Daily limit reached';
  return `${quota.remaining} left today`;
}
