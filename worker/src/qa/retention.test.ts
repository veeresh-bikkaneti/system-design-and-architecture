// Tests for worker/src/qa/retention.ts -- the ADR 0003 retention sweep
// (owner decision, 2026-10-26): Veer transcripts and checkpoints are
// hard-deleted 30 days after a user's last session expires.

import { describe, expect, it } from 'vitest';
import { asD1, FakeD1 } from './fake-d1';
import { qaThreadId } from './graph';
import { cleanupExpiredQaData } from './retention';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-26T12:00:00.000Z');
const iso = (t: number) => new Date(t).toISOString();

function seedUser(
  fake: FakeD1,
  githubId: string,
  sessionExpiresAt: string,
): void {
  fake.users.set(githubId, {
    github_id: githubId,
    login: `user-${githubId}`,
    avatar_url: null,
    created_at: iso(NOW.getTime() - 90 * DAY_MS),
    last_seen_at: sessionExpiresAt,
  });
  const hash = `hash-${githubId}`;
  fake.sessions.set(hash, {
    token_hash: hash,
    github_id: githubId,
    created_at: iso(NOW.getTime() - 90 * DAY_MS),
    expires_at: sessionExpiresAt,
  });
  fake.messages.push(
    {
      id: fake.allocMessageId(),
      github_id: githubId,
      role: 'user',
      content: 'a question',
      created_at: iso(NOW.getTime() - 40 * DAY_MS),
    },
    {
      id: fake.allocMessageId(),
      github_id: githubId,
      role: 'assistant',
      content: 'an answer',
      created_at: iso(NOW.getTime() - 40 * DAY_MS),
    },
  );
  fake.checkpoints.set(qaThreadId(githubId), {
    thread_id: qaThreadId(githubId),
    state: '{"messages":[]}',
    updated_at: iso(NOW.getTime() - 40 * DAY_MS),
  });
}

describe('cleanupExpiredQaData', () => {
  it('expired transcripts and checkpoints are hard-deleted 30 days after session expiry', async () => {
    const fake = new FakeD1();
    // Last session expired 31 days ago: past the 30-day grace -> purge.
    seedUser(fake, 'old-user', iso(NOW.getTime() - 31 * DAY_MS));
    // Last session expired 29 days ago: still inside the grace -> keep.
    seedUser(fake, 'grace-user', iso(NOW.getTime() - 29 * DAY_MS));
    // Session still live -> keep.
    seedUser(fake, 'live-user', iso(NOW.getTime() + 10 * DAY_MS));

    const result = await cleanupExpiredQaData(asD1(fake), NOW);
    expect(result.usersPurged).toBe(1);

    // The purged user leaves nothing behind: no transcript rows, no
    // checkpoint, no session rows.
    expect(fake.messages.filter((m) => m['github_id'] === 'old-user')).toHaveLength(0);
    expect(fake.checkpoints.has(qaThreadId('old-user'))).toBe(false);
    expect([...fake.sessions.values()].filter((s) => s['github_id'] === 'old-user')).toHaveLength(0);

    // Everyone else is untouched.
    for (const kept of ['grace-user', 'live-user']) {
      expect(fake.messages.filter((m) => m['github_id'] === kept)).toHaveLength(2);
      expect(fake.checkpoints.has(qaThreadId(kept))).toBe(true);
      expect([...fake.sessions.values()].filter((s) => s['github_id'] === kept)).toHaveLength(1);
    }

    // Idempotent: a second sweep finds nothing left to purge.
    const again = await cleanupExpiredQaData(asD1(fake), NOW);
    expect(again.usersPurged).toBe(0);
  });

  it('sweeps expired OAuth state nonces but keeps unexpired ones', async () => {
    const fake = new FakeD1();
    fake.oauthStates.set('expired-state', {
      state_hash: 'expired-state',
      created_at: iso(NOW.getTime() - DAY_MS),
      expires_at: iso(NOW.getTime() - 1000),
    });
    fake.oauthStates.set('fresh-state', {
      state_hash: 'fresh-state',
      created_at: iso(NOW.getTime()),
      expires_at: iso(NOW.getTime() + 10 * 60 * 1000),
    });
    await cleanupExpiredQaData(asD1(fake), NOW);
    expect(fake.oauthStates.has('expired-state')).toBe(false);
    expect(fake.oauthStates.has('fresh-state')).toBe(true);
  });
});
