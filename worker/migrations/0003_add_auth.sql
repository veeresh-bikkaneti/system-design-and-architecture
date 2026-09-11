-- Phase 3: prove ownership of an email via a single-use magic link, then
-- represent that as a short-lived session. Both tokens are stored only as a
-- SHA-256 hash -- like a password, the raw value is a bearer credential for
-- its lifetime, so a read of this table alone must not be enough to use it.

CREATE TABLE magic_links (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,                 -- NULL until used; single-use once set
  ip_hash     TEXT                  -- rate-limit key; same data-minimization rationale as exam_attempts.ip_hash
);

CREATE INDEX idx_magic_links_email ON magic_links(email);
CREATE INDEX idx_magic_links_ip_hash ON magic_links(ip_hash);

-- A short-lived (60s), single-use code, distinct from the 7-day session
-- token: the /auth/verify redirect carries this, never the real session,
-- so a long-lived bearer credential never sits in a URL (and therefore
-- browser history) for its whole validity window. The frontend exchanges
-- this for the real session via a POST body immediately on page load.
CREATE TABLE exchange_codes (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE INDEX idx_sessions_email ON sessions(email);
