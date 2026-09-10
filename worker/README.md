# Certificate backend (Phase 1 of 4)

A small Cloudflare Worker + D1 database backing the course's verifiable-certificate feature. The
course site itself stays exactly as it is — static, on GitHub Pages, no login required to learn.
This Worker exists only for the parts that genuinely need a backend: proving a learner's identity,
scoring the certification exam server-side, issuing a credential, and letting a stranger verify one
via a public link. "Phases 2–4" below is the rest of that design and why it's sequenced this way.

## What's real right now (Phase 1)

- `migrations/0001_init.sql` — the `credentials` and `exam_attempts` tables.
- `src/index.ts` — a working Worker with two routes:
  - `GET /health` → `{"status":"ok"}`
  - `GET /verify/:id` → reads the `credentials` table by id and renders an HTML page (200 with
    the credential's course/score/issued-date/badge-link if found, with the email masked for the
    public page; 404 with a clean "not found" state otherwise).

Both routes are implemented and were exercised against a real local D1 database during
development — not just typechecked. Nothing here calls out to email, an OAuth provider, or a
badge platform yet; there's nothing to issue a credential yet, so `/verify/:id` will only ever
show what you insert by hand (see below) until Phase 2.

## Local development

```bash
npm install
npm run db:migrate:local   # applies migrations/*.sql to a local D1 (no Cloudflare account needed)
npm run dev                 # wrangler dev on http://localhost:8787
```

`wrangler dev` (without `--remote`) runs entirely locally — no Cloudflare account, login, or
network access to Cloudflare is required for any of the above. To poke at it before Phase 2 exists,
insert a row directly:

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
3. `wrangler deploy` to actually publish the Worker (and decide on a real route/domain for it —
   the main course site can call it cross-origin, or you can front both with one Cloudflare Pages
   project later if you want a single origin).

## What's not built yet (Phases 2–4)

- **Phase 2 — server-side exam.** An exam question bank the client never sees answers for, and a
  scoring endpoint. Needed before this is trustworthy: today's practice quizzes ship
  `correctIndex` in the site's JS bundle, which is fine for self-check but means nothing server-
  verified yet backs a "passed" claim.
- **Phase 3 — identity.** Email magic-link (decided over OAuth, to avoid registering an app with
  any provider): request a link, click it, get a short-lived signed session. Needs a transactional
  email provider (e.g. Resend/Postmark) and its API key as a Worker secret, plus a
  `magic_links`/session table this migration deliberately doesn't include yet.
- **Phase 4 — issuance.** On a passing exam score, write the `credentials` row for real and call
  Canvas Badges (Badgr free tier — decided over Credly/self-hosted) to issue an Open Badge to the
  learner's verified email, storing the returned assertion URL in `badge_url`. Needs a Canvas
  Badges account, an issuer + badge definition created there, and API credentials as Worker
  secrets. This also then needs a LinkedIn "Add to profile" link/button on the front end pointing
  at the issued badge.
