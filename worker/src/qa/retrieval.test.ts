// P1 (course Q&A tutor): tests for worker/src/qa/retrieval.ts.
//
// These tests run against REAL FTS5 via node:sqlite (DatabaseSync) — the
// same FTS5/bm25/snippet implementation D1 uses — with the REAL
// worker/migrations/0006_qa_chunks.sql schema applied. A tiny adapter
// implements only the D1 surface retrieval.ts touches (prepare/bind/all/
// first); if retrieval.ts starts emitting a new statement shape the
// adapter keeps it honest by construction (typed bind params only).

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
// File contents via vitest `?raw` — no node:fs/path/url needed (see test-env.d.ts).
import CURRICULUM_TS from './curriculum.ts?raw';
import MIGRATION_SQL from '../../migrations/0006_qa_chunks.sql?raw';
import {
  DEFAULT_TOP_K,
  READ_LESSON_MAX_CHARS,
  readLessonText,
  sanitizeFtsQuery,
  searchLessons,
} from './retrieval';

/** Split SQL text into statements, respecting single-quoted strings ('' escape). */
function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    cur += ch;
    if (inStr) {
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          cur += sql[i + 1];
          i++;
        } else {
          inStr = false;
        }
      }
    } else if (ch === "'") {
      inStr = true;
    } else if (ch === ';') {
      if (cur.trim().length > 0) stmts.push(cur);
      cur = '';
    }
  }
  if (cur.trim().length > 0) stmts.push(cur);
  return stmts;
}

/** Minimal D1-compatible surface over node:sqlite, for retrieval.ts only. */
class NodeSqliteD1 {
  constructor(private db: DatabaseSync) {}
  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    return {
      bind: (...params: Array<string | number>) => ({
        all: async <T>(): Promise<{ results: T[] }> => ({
          results: stmt.all(...params) as T[],
        }),
        first: async <T>(): Promise<T | null> => (stmt.get(...params) as T | undefined) ?? null,
      }),
    };
  }
}

const asD1 = (a: NodeSqliteD1) => a as unknown as D1Database;

/** Fresh in-memory DB with the real migration applied (schema + seed). */
function seededDb(): { db: DatabaseSync; d1: D1Database; chunkCount: number } {
  const sql = MIGRATION_SQL;
  const marker = '-- ---- SEED DATA';
  const cut = sql.indexOf(marker);
  if (cut === -1) throw new Error('seed marker missing from 0006_qa_chunks.sql');
  const db = new DatabaseSync(':memory:');
  db.exec(sql.slice(0, cut)); // schema + triggers
  let chunkCount = 0;
  for (const stmt of splitStatements(sql.slice(cut))) {
    if (/^\s*INSERT\s/i.test(stmt)) {
      db.exec(stmt);
      chunkCount++;
    }
  }
  // Controlled synthetic chunks for precise ranking assertions.
  const ins = db.prepare(
    'INSERT INTO qa_chunks (slug, title, heading, ordinal, text) VALUES (?, ?, ?, ?, ?)',
  );
  ins.run(
    'zz-title-match',
    'Raft Consensus Explained',
    '',
    0,
    'Generic filler about databases and networks with no special vocabulary at all.',
  );
  ins.run(
    'zz-heading-match',
    'Another Distributed Systems Lesson',
    'Raft Consensus',
    0,
    'More generic filler words about servers and disks and cables.',
  );
  ins.run(
    'zz-body-match',
    'Totally Unrelated Lesson',
    '',
    0,
    'This body text mentions raft consensus deep inside a long paragraph about leader election and log replication.',
  );
  return { db, d1: asD1(new NodeSqliteD1(db)), chunkCount: chunkCount + 3 };
}

describe('sanitizeFtsQuery', () => {
  it('builds quoted AND phrases from plain input', () => {
    expect(sanitizeFtsQuery('CAP theorem partitions')).toBe('"cap" "theorem" "partitions"');
  });

  it('lowercases and drops sub-2-char tokens, caps at 10 terms', () => {
    const q = sanitizeFtsQuery('A Consistency MODEL for x of the QUORUM systems at scale today here');
    expect(q).toBe(
      '"consistency" "model" "for" "of" "the" "quorum" "systems" "at" "scale" "today"',
    );
    expect(q.split(' ').length).toBe(10);
  });

  it('neutralizes hostile FTS5/SQL syntax without throwing', () => {
    const hostile = [
      '" OR "1"="1',
      '*',
      'foo "bar', // unbalanced quote
      'NEAR(',
      'title:foo',
      "'; DROP TABLE qa_chunks;--",
      'a', // single char only
      '   ',
      '日本語テスト',
    ];
    for (const h of hostile) {
      const s = sanitizeFtsQuery(h);
      // Only quoted alphanumeric phrases (or the empty phrase) may come out.
      expect(s).toMatch(/^("[a-z0-9]+" ?)+$|^""$/);
    }
    expect(sanitizeFtsQuery('*')).toBe('""');
    expect(sanitizeFtsQuery("'; DROP TABLE qa_chunks;--")).toBe('"drop" "table" "qa" "chunks"');
  });
});

describe('searchLessons', () => {
  it('prefers title matches over heading matches over body matches', async () => {
    const { d1 } = seededDb();
    const hits = await searchLessons(d1, 'raft consensus', 10);
    const order = hits.map((h) => h.slug);
    const ti = order.indexOf('zz-title-match');
    const hi = order.indexOf('zz-heading-match');
    const bi = order.indexOf('zz-body-match');
    expect(ti).toBeGreaterThanOrEqual(0);
    expect(hi).toBeGreaterThanOrEqual(0);
    expect(bi).toBeGreaterThanOrEqual(0);
    expect(ti).toBeLessThan(hi);
    expect(hi).toBeLessThan(bi);
  });

  it('finds real lesson content from the seeded index', async () => {
    const { d1 } = seededDb();
    const hits = await searchLessons(d1, 'single responsibility');
    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0]!;
    expect(top.slug).toBe('solid-principles');
    expect(top.excerpt.length).toBeGreaterThan(0);
    expect(typeof top.score).toBe('number');
  });

  it('returns [] for blank queries without touching the DB', async () => {
    const { d1 } = seededDb();
    // Spy: any prepare() call throws, proving no DB hit.
    const spy = {
      prepare: () => {
        throw new Error('DB must not be hit for blank queries');
      },
    } as unknown as D1Database;
    expect(await searchLessons(spy, '')).toEqual([]);
    expect(await searchLessons(spy, '   ')).toEqual([]);
    expect(await searchLessons(d1, '*')).toEqual([]); // sanitizes to '""', matches nothing
  });

  it('clamps k to 1..10 and defaults to DEFAULT_TOP_K', async () => {
    expect(DEFAULT_TOP_K).toBe(5);
    const { d1 } = seededDb();
    const hits = await searchLessons(d1, 'the', 100);
    expect(hits.length).toBeLessThanOrEqual(10);
    const one = await searchLessons(d1, 'the', 0);
    expect(one.length).toBe(1);
  });

  it('hostile queries can neither throw nor match everything', async () => {
    const { db, d1, chunkCount } = seededDb();
    const total = (db.prepare('SELECT COUNT(*) AS c FROM qa_chunks').get() as { c: number }).c;
    expect(total).toBe(chunkCount);
    const hostile = ['" OR "1"="1', 'NEAR(', 'title:foo', "'; DROP TABLE qa_chunks;--"];
    for (const h of hostile) {
      const hits = await searchLessons(d1, h, 10);
      expect(hits.length).toBeLessThan(total); // never the whole table
    }
    // The injection attempt left the table intact.
    const after = (db.prepare('SELECT COUNT(*) AS c FROM qa_chunks').get() as { c: number }).c;
    expect(after).toBe(chunkCount);
  });

  it('never interpolates user input into SQL — MATCH is always bound', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const spy = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => {
          calls.push({ sql, params });
          return {
            all: async () => ({ results: [] }),
            first: async () => null,
          };
        },
      }),
    } as unknown as D1Database;
    const hostile = '"; DROP TABLE qa_chunks;--';
    await searchLessons(spy, hostile, 5);
    expect(calls.length).toBe(1);
    const call = calls[0]!;
    expect(call.sql).toContain('MATCH ?');
    expect(call.sql).not.toContain(hostile);
    expect(call.params[0]).toBe(sanitizeFtsQuery(hostile));
    expect(call.params[1]).toBe(5);
  });
});

describe('readLessonText', () => {
  it('reassembles chunks in ordinal order with the lesson title', async () => {
    const { d1 } = seededDb();
    const lesson = await readLessonText(d1, 'solid-principles');
    expect(lesson).not.toBeNull();
    expect(lesson!.slug).toBe('solid-principles');
    expect(lesson!.title).toBe('SOLID: Object-Oriented Design That Ages Well');
    expect(lesson!.truncated).toBe(false);
    expect(lesson!.text.length).toBeGreaterThan(1000);
    expect(lesson!.text.length).toBeLessThanOrEqual(READ_LESSON_MAX_CHARS);
  });

  it('truncates at maxChars and flags it', async () => {
    const { d1 } = seededDb();
    const lesson = await readLessonText(d1, 'solid-principles', 100);
    expect(lesson).not.toBeNull();
    expect(lesson!.text.length).toBe(100);
    expect(lesson!.truncated).toBe(true);
    const exact = await readLessonText(d1, 'solid-principles', READ_LESSON_MAX_CHARS);
    expect(exact!.text.length).toBeLessThanOrEqual(READ_LESSON_MAX_CHARS);
  });

  it('returns null for unknown slugs', async () => {
    const { d1 } = seededDb();
    expect(await readLessonText(d1, 'no-such-lesson')).toBeNull();
  });

  it('rejects bad slugs without touching the DB', async () => {
    const spy = {
      prepare: () => {
        throw new Error('DB must not be hit for invalid slugs');
      },
    } as unknown as D1Database;
    const bad = ["' OR '1'='1", '../etc/passwd', 'ABC', 'a'.repeat(81), '', 'has space', 'semi;colon'];
    for (const slug of bad) {
      expect(await readLessonText(spy, slug)).toBeNull();
    }
  });
});

describe('generated artifacts contain no quiz content', () => {
  // Distinctive quiz question strings sampled from three different lessons.
  const QUIZ_STRINGS = [
    'Your ReportGenerator class also sends the report by email and saves a copy to the database. Which principle is it violating?',
    'The phone line between your two diners is cut. A CP system will...',
    'In the cache-aside pattern, what happens on a cache miss?',
  ];

  it('0006_qa_chunks.sql has no answer keys or quiz questions', () => {
    const sql = MIGRATION_SQL;
    // `correctIndex` may only appear in the header comment, never in seed data.
    for (const line of sql.split('\n')) {
      if (line.includes('correctIndex')) {
        expect(line.trimStart().startsWith('--')).toBe(true);
      }
    }
    for (const q of QUIZ_STRINGS) {
      expect(sql).not.toContain(q);
    }
    // `<Quiz` may only appear in the header comment, never in seed data.
    for (const line of sql.split('\n')) {
      if (line.includes('<Quiz')) {
        expect(line.trimStart().startsWith('--')).toBe(true);
      }
    }
  });

  it('curriculum.ts has no quiz material', () => {
    const ts = CURRICULUM_TS;
    expect(ts).not.toContain('correctIndex');
    for (const q of QUIZ_STRINGS) {
      expect(ts).not.toContain(q);
    }
  });

  it('curriculum.ts carries the full syllabus and video list', () => {
    const ts = CURRICULUM_TS;
    expect(ts).toContain('export const CURRICULUM: CurriculumEntry[]');
    expect(ts).toContain('export const LESSON_VIDEOS: LessonVideo[]');
    expect(ts).toContain('solid-principles');
    expect(ts).toContain('https://www.youtube.com/watch?v=');
  });
});
