-- Phase 4 (OWASP hardening): generic fixed-window rate-limit counters for
-- endpoints that don't have their own attempt tables (/auth/verify,
-- /auth/exchange, /auth/session, /auth/logout). The increment is a single
-- atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING statement, so --
-- unlike the older check-then-insert counters -- concurrent bursts can't
-- slip past the cap.
CREATE TABLE rate_limit_counters (
  bucket_key   TEXT NOT NULL,  -- e.g. 'auth_verify:ip:<sha256>'
  window_start TEXT NOT NULL,  -- ISO hour the window opened, e.g. '2026-09-17T03'
  count        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_key, window_start)
);
