// Retention cleanup for the course Q&A tutor ("Veer") — Manifest 1.
//
// Owner decision recorded in ADR 0003 (2026-10-26): transcripts are
// hard-deleted 30 days after session expiry. A learner's tutor data
// (qa_messages audit/transcript + the LangGraph checkpoint) is keyed by
// GitHub user, while sessions are the only expiry clock in the schema
// (qa_sessions.expires_at, 30 days after login). So the rule is: once a
// user's MOST RECENT session has been expired for a full 30 days, purge
// that user's messages, checkpoint, and session rows outright. A user
// with any session still live -- or expired less than 30 days ago -- is
// untouched, so an active learner never loses memory mid-course.
//
// Invoked from the Worker's scheduled handler (see src/index.ts, daily
// cron in wrangler.toml). Kept deliberately small: three deletes per
// expired user, plus housekeeping of expired OAuth state nonces.

import { qaThreadId } from './graph';

/** Grace period between a user's last session expiring and the purge. */
export const QA_RETENTION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export interface QaRetentionResult {
  /** GitHub users whose transcripts + checkpoints were hard-deleted. */
  usersPurged: number;
}

/**
 * Hard-deletes transcripts and checkpoints for every user whose most
 * recent session expired more than QA_RETENTION_GRACE_MS before `now`.
 * Idempotent: a second run finds nothing left to purge.
 */
export async function cleanupExpiredQaData(
  db: D1Database,
  now: Date = new Date(),
): Promise<QaRetentionResult> {
  const cutoff = new Date(now.getTime() - QA_RETENTION_GRACE_MS).toISOString();
  const { results } = await db
    .prepare(
      'SELECT github_id FROM qa_sessions GROUP BY github_id HAVING MAX(expires_at) < ?',
    )
    .bind(cutoff)
    .all<{ github_id: string }>();

  for (const row of results) {
    await db
      .prepare('DELETE FROM qa_messages WHERE github_id = ?')
      .bind(row.github_id)
      .run();
    await db
      .prepare('DELETE FROM qa_checkpoints WHERE thread_id = ?')
      .bind(qaThreadId(row.github_id))
      .run();
    await db
      .prepare('DELETE FROM qa_sessions WHERE github_id = ?')
      .bind(row.github_id)
      .run();
  }

  // Housekeeping: OAuth state nonces are single-use with a 10-minute TTL;
  // sweep any that were never redeemed so the table stays empty in
  // practice. (Not transcript data -- no retention clock applies.)
  await db
    .prepare('DELETE FROM qa_oauth_states WHERE expires_at < ?')
    .bind(now.toISOString())
    .run();

  return { usersPurged: results.length };
}
