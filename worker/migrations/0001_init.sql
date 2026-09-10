-- Phase 1: credential records and exam-attempt audit trail.
--
-- Deliberately NOT included yet (added in later phases, once the accounts/flows
-- that need them exist): a magic-link / session table (Phase 3, identity), and
-- the exam question bank itself (Phase 2, server-side scoring).

CREATE TABLE credentials (
  id              TEXT PRIMARY KEY,               -- public id used in /verify/:id (short random slug)
  email           TEXT NOT NULL,                  -- learner's verified email at issuance time
  course_slug     TEXT NOT NULL DEFAULT 'system-design-mastery',
  score           INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  issued_at       TEXT NOT NULL,                  -- ISO 8601 UTC timestamp
  badge_status    TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'issued' | 'failed'
  badge_url       TEXT                             -- Open Badge assertion URL, once issued (Phase 4)
);

CREATE INDEX idx_credentials_email ON credentials(email);

-- One row per exam attempt (pass or fail), for basic rate-limiting/abuse checks
-- and an audit trail independent of whether a credential was ultimately issued.
CREATE TABLE exam_attempts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  score           INTEGER,
  total_questions INTEGER,
  passed          INTEGER NOT NULL DEFAULT 0,     -- 0 or 1
  ip_hash         TEXT                              -- salted hash, never a raw IP
);

CREATE INDEX idx_exam_attempts_email ON exam_attempts(email);
CREATE INDEX idx_exam_attempts_started_at ON exam_attempts(started_at);
