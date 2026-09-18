-- 0007_qa_oauth.sql — GitHub OAuth login for the course Q&A tutor ("Veer").
--
-- Abuse protection: every /api/qa/chat call now costs a GitHub identity
-- (interactive OAuth) plus a per-user daily quota, so anonymous bots can't
-- burn Workers AI calls. Quota and the audit trail are keyed by GitHub
-- user id, and the LangGraph checkpoint thread is per-user.
--
-- SAFE TO DROP+RECREATE BELOW: migration 0005's qa_sessions/qa_messages
-- tables never reached production (database_id in wrangler.toml is still
-- the REPLACE_WITH_REAL_D1_DATABASE_ID placeholder), so no real rows can
-- exist to lose. qa_checkpoints (also from 0005) is left untouched -- only
-- the thread_id convention changes (now `qa:user:<github_id>`, see graph.ts).

-- GitHub identities that have signed in to the tutor. github_id is the
-- numeric GitHub user id, stored as text (it exceeds 32 bits).
CREATE TABLE IF NOT EXISTS qa_users (
  github_id    TEXT PRIMARY KEY,
  login        TEXT NOT NULL,
  avatar_url   TEXT,
  created_at   TEXT NOT NULL, -- ISO 8601 UTC timestamp
  last_seen_at TEXT NOT NULL  -- ISO 8601 UTC timestamp; bumped on each login
);

-- OAuth `state` nonces. Only the SHA-256 hash is stored (the raw state is
-- a CSRF bearer token while the flow is in flight); rows are single-use
-- (deleted on callback) and expire after 10 minutes regardless.
CREATE TABLE IF NOT EXISTS qa_oauth_states (
  state_hash TEXT PRIMARY KEY, -- SHA-256 hex of the random state value
  created_at TEXT NOT NULL,    -- ISO 8601 UTC timestamp
  expires_at TEXT NOT NULL     -- ISO 8601 UTC timestamp; 10 minutes after creation
);

-- Login sessions: opaque bearer tokens, stored as SHA-256 hashes only
-- (same convention as auth.ts -- raw tokens are never persisted).
DROP TABLE IF EXISTS qa_sessions;
CREATE TABLE qa_sessions (
  token_hash TEXT PRIMARY KEY, -- SHA-256 hex of the 256-bit session token
  github_id  TEXT NOT NULL REFERENCES qa_users(github_id),
  created_at TEXT NOT NULL,    -- ISO 8601 UTC timestamp
  expires_at TEXT NOT NULL     -- ISO 8601 UTC timestamp; 30 days after creation
);
CREATE INDEX idx_qa_sessions_github ON qa_sessions(github_id);

-- Audit trail + the source of truth for the per-USER daily quota (50
-- questions/day/GitHub user). Keyed by github_id, not by session: one user
-- gets one quota no matter how many devices they sign in from.
DROP TABLE IF EXISTS qa_messages;
CREATE TABLE qa_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id  TEXT NOT NULL, -- qa_users.github_id
  role       TEXT NOT NULL, -- 'user' | 'assistant'
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL  -- ISO 8601 UTC timestamp
);
CREATE INDEX idx_qa_messages_user ON qa_messages(github_id, created_at);
