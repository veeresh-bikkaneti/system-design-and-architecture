// P2 (course Q&A tutor): end-to-end-ish agent test with the REAL retrieval
// layer (worker/src/qa/retrieval.ts) over REAL FTS5 via node:sqlite, the
// REAL tool implementations, and the scripted MockModel.
//
// Unlike agent.test.ts (which mocks ./retrieval), this file proves the
// tool schemas, retrieval SQL, and graph loop work together: a scripted
// tool round returns genuine lesson chunks from the index. The model is
// still scripted and nothing touches the network.

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
// File contents via vitest `?raw` -- no node:fs/path/url needed (see test-env.d.ts).
import MIGRATION_SQL from '../../migrations/0006_qa_chunks.sql?raw';
import { loadCheckpoint } from './checkpointer';
import { qaThreadId, runQaTurn } from './graph';
import { MockModel, toolMessageContents } from './mock-model';

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
        run: async (): Promise<void> => {
          stmt.run(...params);
        },
      }),
    };
  }
}

const asD1 = (a: NodeSqliteD1) => a as unknown as D1Database;

/** In-memory DB with the real chunk schema + the checkpointer table. */
function lessonDb(): D1Database {
  const cut = MIGRATION_SQL.indexOf('-- ---- SEED DATA');
  if (cut === -1) throw new Error('seed marker missing from 0006_qa_chunks.sql');
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION_SQL.slice(0, cut));
  db.exec(
    'CREATE TABLE IF NOT EXISTS qa_checkpoints (thread_id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at TEXT NOT NULL)',
  );
  const insert = db.prepare(
    'INSERT INTO qa_chunks (slug, title, heading, ordinal, text) VALUES (?, ?, ?, ?, ?)',
  );
  // Seed vocabulary note: searchLessons builds an implicit-AND FTS5 phrase
  // query with no stemming, so the seed text must literally contain the
  // query tokens for a hit.
  insert.run(
    'caching-strategies',
    'Caching Strategies',
    'Cache-aside',
    0,
    'Cache-aside is a read-heavy caching pattern: on a miss the application loads from the database, which is how most caching systems work and does lazy loading.',
  );
  insert.run(
    'caching-strategies',
    'Caching Strategies',
    'Write-through',
    1,
    'Write-through caching writes every update to the cache and the database together, keeping them consistent at the cost of write latency.',
  );
  return asD1(new NodeSqliteD1(db));
}

describe('agent + real retrieval integration', () => {
  it('a scripted tool round retrieves genuine lesson chunks and cites the lesson', async () => {
    const db = lessonDb();
    const model = new MockModel(
      [
        {
          toolCalls: [
            { name: 'search_lessons', args: { query: 'caching', top_k: 3 } },
            { name: 'read_lesson', args: { slug: 'caching-strategies' } },
          ],
        },
      ],
      { finalText: 'Use cache-aside for read-heavy workloads.' },
    );

    const { finalAnswer, sources } = await runQaTurn(db, 'u1', 'How does caching work?', { model });

    expect(finalAnswer).toBe('Use cache-aside for read-heavy workloads.');
    // retrieveNode (real FTS) already grounded citations for this turn.
    expect(sources).toContainEqual({ slug: 'caching-strategies', title: 'Caching Strategies' });

    // Both real tool implementations ran against the real index.
    const contents = toolMessageContents(model.invokeCalls[1]!);
    expect(contents).toHaveLength(2);
    expect(contents[0]).toContain('COURSE DATA');
    expect(contents[0]).toContain('caching-strategies');
    expect(contents[1]).toContain('Write-through caching writes every update');

    // The turn was checkpointed under the per-user thread.
    const saved = await loadCheckpoint(db, qaThreadId('u1'));
    expect(saved?.state.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('retrieval misses degrade to an empty context instead of failing the turn', async () => {
    const db = lessonDb();
    const model = new MockModel(
      [{ toolCalls: [{ name: 'search_lessons', args: { query: 'quantum teleportation' } }] }],
      { finalText: 'Not in the course.' },
    );
    const { finalAnswer, sources } = await runQaTurn(db, 'u1', 'Explain quantum teleportation', { model });
    expect(finalAnswer).toBe('Not in the course.');
    expect(sources).toEqual([]);
  });
});
