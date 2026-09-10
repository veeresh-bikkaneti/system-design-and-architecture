-- exam_attempts(ip_hash) had no index, despite being queried on every single
-- /exam/submit request (the per-IP rate-limit check) -- a full table scan on
-- a hot, public, unauthenticated path. A new migration rather than editing
-- 0001_init.sql: D1's d1_migrations tracks applied migrations by filename
-- only, not by content hash, so any database that already ran 0001 (local
-- or, eventually, remote) would silently never pick up an edit to it.

CREATE INDEX idx_exam_attempts_ip_hash ON exam_attempts(ip_hash);
