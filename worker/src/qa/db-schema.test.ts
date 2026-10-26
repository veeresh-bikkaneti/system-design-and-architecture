// DB_QA seam test (Manifest 1, Seat C objection 7(i)): the separate QA
// database must contain every table the transplanted QA code touches.
//
// The September code was written against ONE shared D1, where migration
// 0004's generic `rate_limit_counters` table sat next to the qa_* tables.
// With the ADR 0003 split, the QA database gets migrations 0005-0007 --
// and 0004 as well, because qaThrottleByIp -> checkRateLimit (auth.ts)
// increments rate_limit_counters on the QA binding for every /api/qa/*
// request. FakeD1 emulates those counters in a Map, so only a test
// against the REAL migration set on a REAL SQLite can catch a missing
// table. This is that test: it applies the migrations to node:sqlite and
// runs the real checkRateLimit / qaThrottleByIp against the result.

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { checkRateLimit, currentWindowHour } from '../auth';
import MIGRATION_0004 from '../../migrations/0004_rate_limits.sql?raw';
import MIGRATION_0005 from '../../migrations/0005_qa_sessions.sql?raw';
import MIGRATION_0007 from '../../migrations/0007_qa_oauth.sql?raw';
import { qaThrottleByIp } from './routes';

/** Minimal D1 surface (prepare/bind/first/run) over node:sqlite. */
class NodeSqliteD1 {
  constructor(private db: DatabaseSync) {}
  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    const bound = (...params: Array<string | number>) => ({
      first: async <T>(): Promise<T | null> =>
        (stmt.get(...params) as T | undefined) ?? null,
      run: async (): Promise<{ success: boolean }> => {
        stmt.run(...params);
        return { success: true };
      },
    });
    return { bind: bound, ...bound() };
  }
}

const asD1 = (a: NodeSqliteD1) => a as unknown as D1Database;

/** Fresh in-memory DB with the QA database's migration set applied. */
function qaDb(): { db: DatabaseSync; d1: D1Database } {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION_0004);
  db.exec(MIGRATION_0005);
  db.exec(MIGRATION_0007);
  return { db, d1: asD1(new NodeSqliteD1(db)) };
}

describe('QA database migration set (DB_QA seam)', () => {
  it('creates every table the QA code queries', () => {
    const { db } = qaDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tables = new Set(rows.map((r) => r.name));
    for (const required of [
      'qa_users', // oauth.ts
      'qa_oauth_states', // oauth.ts
      'qa_sessions', // oauth.ts (post-0007 shape)
      'qa_messages', // routes.ts
      'qa_checkpoints', // checkpointer.ts
      'rate_limit_counters', // qaThrottleByIp -> checkRateLimit (auth.ts)
    ]) {
      expect(tables.has(required), `missing table ${required}`).toBe(true);
    }
  });

  it('checkRateLimit increments atomically against the real schema', async () => {
    const { d1 } = qaDb();
    const window = currentWindowHour();
    expect(await checkRateLimit(d1, 'qa_chat:ip:test', window, 2)).toBe(true);
    expect(await checkRateLimit(d1, 'qa_chat:ip:test', window, 2)).toBe(true);
    expect(await checkRateLimit(d1, 'qa_chat:ip:test', window, 2)).toBe(false);
  });

  it('qaThrottleByIp throttles against the real schema (the DB_QA seam)', async () => {
    const { d1 } = qaDb();
    const req = () =>
      new Request('https://worker.test/api/qa/chat', {
        headers: { 'CF-Connecting-IP': '198.51.100.23' },
      });
    expect(await qaThrottleByIp(req(), d1, 'qa_chat', 2)).toBe(true);
    expect(await qaThrottleByIp(req(), d1, 'qa_chat', 2)).toBe(true);
    expect(await qaThrottleByIp(req(), d1, 'qa_chat', 2)).toBe(false);
  });
});
