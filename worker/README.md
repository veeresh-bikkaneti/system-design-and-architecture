# Certificate backend (Phases 1–2 of 4)

A small Cloudflare Worker + D1 database backing the course's verifiable-certificate feature. The
course site itself stays exactly as it is — static, on GitHub Pages, no login required to learn.
This Worker exists only for the parts that genuinely need a backend: proving a learner's identity,
scoring the certification exam server-side, issuing a credential, and letting a stranger verify one
via a public link. "Phases 3–4" below is the rest of that design and why it's sequenced this way.

## What's real right now

- `migrations/` — `0001_init.sql` creates the `credentials` and `exam_attempts` tables;
  `0002_add_ip_hash_index.sql` adds an index the first migration missed (`exam_attempts.ip_hash`,
  queried on every `/exam/submit` request) as a separate migration rather than an edit to 0001,
  since D1 tracks applied migrations by filename only — editing an already-applied one would
  silently never reach any database that had already run it.
- `src/exam.ts` — the certification exam's question bank (9 questions, 3 each across the
  cap-theorem, load-balancers, and data-partitioning lessons) and scoring logic. This module is
  server-only: `publicQuestions()` strips `correctIndex` before anything goes to a client, and
  `scoreSubmission()` never reveals which specific questions were right or wrong — only the
  aggregate score — so a submission can't be used to iteratively probe the answer key.
- `src/index.ts` — a working Worker with four routes:
  - `GET /health` → `{"status":"ok"}`
  - `GET /exam/questions` → the question bank without answers, plus the pass threshold (70%,
    matching the practice quizzes' `QUIZ_PASS_THRESHOLD`).
  - `POST /exam/submit` → `{ email, answers: {questionId: selectedIndex} }` in, `{ score, total,
    passed }` out. Validates the email (format only — proving *ownership* of it is Phase 3),
    rate-limits (5 attempts/email/day, 10/IP/day, both in a rolling 24h window, checked against
    the `exam_attempts` audit table), scores server-side, and records the attempt. Never returns
    per-question correctness.
  - `GET /verify/:id` → reads a credential from D1, renders an HTML page (masks the email; 404
    with a clean "not found" state for an unknown id).
  - CORS is enabled for `/exam/*` only (explicit origin allowlist: the production GitHub Pages
    origin plus local Vite dev/preview), since those are the routes meant to be called from the
    course site's own JS. `/health` and `/verify/:id` don't need it (the latter is meant to be
    opened directly, not fetched cross-origin). **Be clear-eyed about what this does and doesn't
    provide:** CORS is a browser-enforced, read-side restriction — it controls whether a page's JS
    is allowed to read the response, not whether the request reaches and is processed by the
    Worker. `/exam/submit` also requires `Content-Type: application/json`, which closes the
    specific gap where a browser would otherwise skip preflight entirely (CORS "simple requests")
    and let a page on any origin trigger the rate-limit check and DB write silently. Neither of
    these stops a direct, non-browser caller (curl, a script) from calling this public,
    unauthenticated endpoint — that's inherent to it being public and unauthenticated, and it's
    why nothing of real value (a credential) can come from `/exam/submit` alone: Phase 4 only
    issues one after Phase 3 has *verified* the email, not merely received it.

All of this was exercised against a real local D1 database during development, not just
typechecked — including the two integer scores immediately adjacent to the 70% pass threshold
(6/9 ≈ 0.667, confirmed fails; 7/9 ≈ 0.778, confirmed passes — 9 questions means an exact 70.0%
is never a reachable score, so this pair is the real boundary test), the rate limits (confirmed
the exact attempt that trips each cap), the email case-normalization fix
(`User@Example.com` and `user@example.com` correctly share one rate-limit identity, and a
trailing-space email is trimmed and accepted rather than wrongly rejected), the `Content-Type`
requirement (a `text/plain` or missing content-type is correctly rejected with 415), and the
24-hour rate-limit window itself (verified via a direct SQL comparison against a deliberately
stale row proving the fix changes the outcome for exactly the case that mattered).

**Known limitation, disclosed rather than silently accepted:** the rate-limit check and the
`exam_attempts` insert are two separate round-trips, not one atomic operation. A deliberately
concurrent burst of requests from the same caller could each pass the check before any of their
own inserts land, slipping past the daily cap. This is judged acceptable for a free course's
practice-exam abuse control today — a real fix would need a D1 uniqueness constraint with retry,
or a Durable Object as the source of truth for the counter, either of which is more machinery than
this deserves right now. Revisit if this ever protects something higher-stakes than it does today.

Nothing here calls out to email, an OAuth provider, or a badge platform yet — there's still no
write path to `credentials` besides a manual insert, so a passing exam doesn't yet produce a real
credential. That's Phase 4, gated on Phase 3 (identity) existing first.

## Local development

```bash
npm install
npm run db:migrate:local   # applies migrations/*.sql to a local D1 (no Cloudflare account needed)
npm run dev                 # wrangler dev on http://localhost:8787
```

`wrangler dev` (without `--remote`) runs entirely locally — no Cloudflare account, login, or
network access to Cloudflare is required for any of the above.

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

## What still needs a real Cloudflare account (not done here — no account to do it with)

1. `wrangler login`, then `wrangler d1 create system-design-mastery-cert` — replace the
   `database_id` placeholder in `wrangler.toml` with the real id it prints.
2. `npm run db:migrate:remote` to apply the schema to that real database.
3. `wrangler deploy` to actually publish the Worker. The CORS allowlist in `src/index.ts` already
   points at the real production course URL, so no code change is needed for that step — just
   deploying.

## What's not built yet (Phases 3–4)

- **Phase 3 — identity.** Email magic-link (decided over OAuth, to avoid registering an app with
  any provider): request a link, click it, get a short-lived signed session. Needs a transactional
  email provider (e.g. Resend/Postmark) and its API key as a Worker secret, plus a
  `magic_links`/session table this migration deliberately doesn't include yet. This is also what
  turns the email on an exam submission from "self-reported" (today) into "proven owned."
- **Phase 4 — issuance.** On a passing exam score *from a verified email*, write the `credentials`
  row for real and call Canvas Badges (Badgr free tier — decided over Credly/self-hosted) to issue
  an Open Badge to the learner's verified email, storing the returned assertion URL in
  `badge_url`. Needs a Canvas Badges account, an issuer + badge definition created there, and API
  credentials as Worker secrets. This also then needs a LinkedIn "Add to profile" link/button on
  the front end pointing at the issued badge.
