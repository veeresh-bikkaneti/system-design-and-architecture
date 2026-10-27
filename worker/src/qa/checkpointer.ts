// P0 (course Q&A agent): D1-backed LangGraph checkpointer.
//
// LangGraph.js ships checkpoint savers for Postgres/Redis/etc., none of
// which exist on the Workers edge. So the checkpointer is manual and
// deliberately small: one row per session in qa_checkpoints, thread_id IS
// the qa session id. The graph in graph.ts loads state through
// loadCheckpoint() before each turn and persists through saveCheckpoint()
// after it. Memory is keyed strictly to the session -- no cross-session or
// cross-user reads are representable here.

import type { QaGraphState } from './graph';

export interface QaCheckpoint {
  state: QaGraphState;
  updatedAt: string;
}

interface CheckpointRow {
  state: string;
  updated_at: string;
}

/** Latest saved graph state for a session, or null if none exists. */
export async function loadCheckpoint(db: D1Database, threadId: string): Promise<QaCheckpoint | null> {
  const row = await db
    .prepare('SELECT state, updated_at FROM qa_checkpoints WHERE thread_id = ?')
    .bind(threadId)
    .first<CheckpointRow>();
  if (!row) return null;
  let state: QaGraphState;
  try {
    state = JSON.parse(row.state) as QaGraphState;
  } catch {
    // A corrupt row must never wedge a session forever -- treat it as
    // missing and let the next save overwrite it.
    return null;
  }
  if (!state || !Array.isArray(state.messages)) return null;
  return { state, updatedAt: row.updated_at };
}

/** Overwrites the session's saved graph state. */
export async function saveCheckpoint(
  db: D1Database,
  threadId: string,
  state: QaGraphState,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO qa_checkpoints (thread_id, state, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (thread_id) DO UPDATE SET
         state = excluded.state,
         updated_at = excluded.updated_at`,
    )
    .bind(threadId, JSON.stringify(state), now)
    .run();
}

/** Removes the session's checkpoint -- used by DELETE /api/qa/session. */
export async function deleteCheckpoint(db: D1Database, threadId: string): Promise<void> {
  await db.prepare('DELETE FROM qa_checkpoints WHERE thread_id = ?').bind(threadId).run();
}
