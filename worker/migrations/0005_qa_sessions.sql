-- P0 (course Q&A agent): anonymous chat sessions, per-session transcript
-- audit trail, and the LangGraph checkpointer backing store. Sessions are
-- anonymous by design (no login, no PII) -- the id is a random uuid minted
-- by POST /api/qa/session and held in the browser's localStorage.

CREATE TABLE qa_sessions (
  id         TEXT PRIMARY KEY,  -- uuid v4 minted at session creation
  created_at TEXT NOT NULL,     -- ISO 8601 UTC timestamp
  expires_at TEXT NOT NULL      -- ISO 8601 UTC timestamp; 30 days after creation
);

-- Audit trail + the source of truth for the per-session daily quota (50
-- questions/day). The LangGraph checkpoint (qa_checkpoints) is what the
-- agent actually reads back as conversational memory; this table is the
-- append-only log that makes quotas and abuse review possible.
CREATE TABLE qa_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,     -- qa_sessions.id
  role       TEXT NOT NULL,     -- 'user' | 'assistant'
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL      -- ISO 8601 UTC timestamp
);

CREATE INDEX idx_qa_messages_session ON qa_messages(session_id, created_at);

-- LangGraph checkpointer backing store: one row per session holding the
-- serialized graph state (transcript window, rolling summary, loop
-- counters). thread_id IS the qa session id -- memory is keyed strictly
-- to the session and never crosses sessions or users.
CREATE TABLE qa_checkpoints (
  thread_id  TEXT PRIMARY KEY, -- qa_sessions.id
  state      TEXT NOT NULL,     -- JSON-serialized QaGraphState
  updated_at TEXT NOT NULL      -- ISO 8601 UTC timestamp
);
