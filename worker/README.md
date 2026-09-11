# Certificate backend (Phases 1–3 of 4)

A small Cloudflare Worker + D1 database backing the course's verifiable-certificate feature. The
course site itself stays exactly as it is — static, on GitHub Pages, no login required to learn.
This Worker exists only for the parts that genuinely need a backend: proving a learner's identity,
scoring the certification exam server-side, issuing a credential, and letting a stranger verify one
via a public link. "Phase 4" below is the rest of that design and why it's sequenced this way.

## What's real right now

- `migrations/` — `0001_init.sql` creates the `credentials` and `exam_attempts` tables;
  `0002_add_ip_hash_index.sql` adds an index the first migration missed (`exam_attempts.ip_hash`,
  queried on every `/exam/submit` request); `0003_add_auth.sql` adds `magic_links`,
  `exchange_codes`, and `sessions`. Each is its own migration rather than an edit to an earlier
  one, since D1 tracks applied migrations by filename only — editing an already-applied migration
  would silently never reach any database that had already run it.
- `src/exam.ts` — the certification exam's question bank (9 questions, 3 each across the
  cap-theorem, load-balancers, and data-partitioning lessons) and scoring logic. Server-only:
  `publicQuestions()` strips `correctIndex` before anything goes to a client, and
  `scoreSubmission()` never reveals which specific questions were right or wrong — only the
  aggregate score — so a submission can't be used to iteratively probe the answer key.
- `src/auth.ts` — proves ownership of an email via a magic link, then represents that as a
  session:
  - `POST /auth/request-link` — `{email}` in. Rate-limits (5/email/hour, 10/IP/hour), generates a
    single-use token (stored only as a SHA-256 hash — like a password, never in plaintext), and
    emails a link. **Requires an explicit second opt-in beyond "no provider key configured"
    before it will ever hand a link back in the response instead of emailing it** — see "Local
    development" below; this is a fail-closed design specifically so an incomplete/misconfigured
    deployment can't silently leak working sign-in links (see the comment on `sendMagicLinkEmail`
    in `src/auth.ts` for the full reasoning).
  - `GET /auth/verify?token=…` — read-only on the first hit: checks validity without consuming
    the token, and renders a page with a second link (`&confirm=1`) that does the actual
    consuming. Two steps, not one, because corporate email gateways commonly pre-fetch links in
    incoming mail to scan them (Microsoft Defender Safe Links, Proofpoint URL Defense, etc.) — a
    single-use token that a bare GET could consume would get silently burned by the scanner
    before the real recipient ever clicks, breaking login deterministically for anyone behind
    such a gateway.
  - On confirm, redirects to the course site with a **short-lived (60s), single-use exchange
    code** in the URL — never the real session. A long-lived (7-day) bearer token sitting in a
    URL means it sits in browser history for its whole validity window; this code is the
    standard fix (the same shape as an OAuth authorization code) — it's essentially expired by
    the time anyone could read it back out of history.
  - `POST /auth/exchange` — `{code}` in, `{sessionToken, email}` out. The frontend calls this
    immediately on landing (with the code from the URL, then scrubbing it via
    `history.replaceState`) to get the real session, which never touches a URL.
  - `GET /auth/session` — `Authorization: Bearer <session>` in, `{email}` out (401 if invalid or
    expired). This is what Phase 4 will use to require a *verified* email, not merely a
    self-reported one, before issuing anything.
  - Both the magic-link token and the exchange code are consumed via a single
    `UPDATE … WHERE consumed_at IS NULL … RETURNING` statement, not a SELECT followed by a
    separate UPDATE — the affected-row-count from one atomic statement *is* the "did I win"
    check, so two concurrent requests racing the same token/code can't both succeed. This matters
    more here than on the exam endpoint's rate limit (see the known limitation below): these two
    steps mint real credentials, not just increment a counter.
- `src/crypto.ts` — shared `sha256Hex` (used for hashing IPs, magic-link tokens, exchange codes,
  and session tokens) and `randomToken` (32 bytes from `crypto.getRandomValues`, hex-encoded).
- `src/index.ts` — routes everything above, plus:
  - `GET /health` → `{"status":"ok"}`
  - `GET /verify/:id` → reads a credential from D1, renders an HTML page (masks the email; 404
    with a clean "not found" state for an unknown id).
  - CORS is enabled for `/exam/*` and `/auth/*` only (explicit origin allowlist: the production
    GitHub Pages origin plus local Vite dev/preview). `/health` and `/verify/:id` don't need it.
    **Be clear-eyed about what CORS does and doesn't provide:** it's a browser-enforced, read-side
    restriction — it controls whether a page's JS is allowed to *read* the response, not whether
    the request reaches and is processed by the Worker. The JSON POST endpoints also require
    `Content-Type: application/json`, which closes the specific gap where a browser would
    otherwise skip preflight entirely (CORS "simple requests") and let a page on any origin
    trigger a rate-limit check and DB write silently. Neither of these stops a direct,
    non-browser caller (curl, a script) from calling a public, unauthenticated endpoint — that's
    inherent to it being public and unauthenticated, and it's why nothing of real value (a
    credential) can come from the exam or auth endpoints alone: Phase 4 only issues a credential
    once `/auth/session` confirms a *verified* email, not merely a submitted one.

All of this was exercised against a real local D1 database during development, not just
typechecked — including the two integer scores immediately adjacent to the 70% pass threshold
(6/9 ≈ 0.667, confirmed fails; 7/9 ≈ 0.778, confirmed passes), the rate limits (confirmed the
exact attempt that trips each cap), the email case-normalization and trailing-space-trim fixes,
the `Content-Type` requirement, the 24-hour rate-limit window (verified via a direct SQL
comparison against a deliberately stale row), and for Phase 3 specifically: the full
request-link → confirm → exchange → session flow end to end; that a failed/misconfigured send
never leaks a link (confirmed with zero config *and* with a real-but-invalid provider key,
verifying the actual `fetch` code path is taken, not a shortcut); that a failed send never
consumes the caller's rate-limit quota (10 consecutive failures, zero 429s); that the read-only
verify step genuinely doesn't consume the token (fetched it twice before confirming); single-use
enforcement at both the magic-link and exchange-code layers; and exchange-code expiry (via a
deliberately backdated row, the same technique as the 24-hour-window proof).

**Known limitations, disclosed rather than silently accepted:**
- The `exam_attempts` rate-limit check and insert are two separate round-trips, not one atomic
  operation — a deliberately concurrent burst from the same caller could each pass the check
  before any of their own inserts land, slipping past the daily cap. Judged acceptable for a free
  course's practice-exam abuse control; a real fix needs a D1 uniqueness constraint with retry, or
  a Durable Object as the counter's source of truth.
- The `magic_links` rate-limit check has the identical shape and gap, but is higher-priority to
  actually fix given the stakes: a deliberately concurrent burst here means real emails sent to a
  real inbox beyond the intended 5/hour, not just gaming an internal counter. Not fixed in this
  phase for the same reason as above (needs the same kind of atomic-counter machinery), but
  flagged here as a nearer-term follow-up than the exam endpoint's version of this gap.

Nothing here calls out to a badge platform yet, and there's still no write path to `credentials`
besides a manual insert — a verified email and a passing exam score don't yet combine into a real
credential. That's Phase 4.

## Local development

```bash
npm install
npm run db:migrate:local   # applies migrations/*.sql to a local D1 (no Cloudflare account needed)
npm run dev                 # wrangler dev on http://localhost:8787
```

`wrangler dev` (without `--remote`) runs entirely locally — no Cloudflare account, login, or
network access to Cloudflare is required for any of the above, **except** the auth flow's local
testing, which needs one explicit opt-in. Create `worker/.dev.vars` (already gitignored, never
committed):

```
DEV_MODE="true"
```

With that set (and no `RESEND_API_KEY`), `/auth/request-link` echoes the magic link back in its
JSON response (`devLink`) instead of emailing it, so you can test the whole flow without a
provider account:

```bash
curl -X POST http://localhost:8787/auth/request-link -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
# => {"status":"sent","devLink":"http://localhost:8787/auth/verify?token=..."}

curl -i "http://localhost:8787/auth/verify?token=<token>&confirm=1"
# => 302, Location: https://.../#/claim?code=...

curl -X POST http://localhost:8787/auth/exchange -H "Content-Type: application/json" \
  -d '{"code":"<code from the redirect>"}'
# => {"sessionToken":"...", "email":"you@example.com"}

curl http://localhost:8787/auth/session -H "Authorization: Bearer <sessionToken>"
# => {"email":"you@example.com"}
```

Try the exam flow:

```bash
curl http://localhost:8787/exam/questions   # see the questions (no answers)

curl -X POST http://localhost:8787/exam/submit -H "Content-Type: application/json" -d '{
  "email": "you@example.com",
  "answers": {"cap-1":0,"cap-2":2,"cap-3":1,"lb-1":1,"lb-2":2,"lb-3":1,"part-1":1,"part-2":2,"part-3":0}
}'   # this exact set of answers is a perfect score, for convenience while testing
```

To poke at `/verify/:id` before Phase 4 exists, insert a credential row directly:

```bash
npx wrangler d1 execute system-design-mastery-cert --local --command \
  "INSERT INTO credentials (id, email, course_slug, score, total_questions, issued_at, badge_status, badge_url)
   VALUES ('demo', 'learner@example.com', 'system-design-mastery', 9, 10, '2026-09-10T20:00:00Z', 'issued', 'https://example.com/badge');"
```

then visit `http://localhost:8787/verify/demo`.

## What still needs real accounts (not done here — no accounts to do it with)

1. **Cloudflare:** `wrangler login`, then `wrangler d1 create system-design-mastery-cert` —
   replace the `database_id` placeholder in `wrangler.toml` with the real id it prints, then
   `npm run db:migrate:remote` to apply the schema. `wrangler deploy` to actually publish; the
   CORS allowlist in `src/index.ts` already points at the real production course URL, so no code
   change is needed for that step.
2. **Resend (or another transactional email provider):** create an account, verify a sending
   domain, then `wrangler secret put RESEND_API_KEY` (and, once you have a verified sender
   address, `wrangler secret put RESEND_FROM_ADDRESS`) on the deployed Worker. **Do not** set
   `DEV_MODE` on the deployed Worker — it must only ever exist in a developer's own local
   `.dev.vars`; the fail-closed design (see `src/auth.ts`) depends on the committed `wrangler.toml`
   never setting it.

## What's not built yet (Phase 4)

- **Phase 4 — issuance.** On a passing exam score from a session-verified email (requiring both:
  a passing `exam_attempts` row and a valid `/auth/session` for the same address), write the
  `credentials` row for real and call Canvas Badges (Badgr free tier — decided over
  Credly/self-hosted) to issue an Open Badge to the learner's verified email, storing the returned
  assertion URL in `badge_url`. Needs a Canvas Badges account, an issuer + badge definition
  created there, and API credentials as Worker secrets. This also then needs a LinkedIn "Add to
  profile" link/button on the front end pointing at the issued badge.
