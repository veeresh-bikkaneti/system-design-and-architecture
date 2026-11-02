# Council record: PR #125, contact/feedback form + privacy page + worker POST /api/feedback (T1)

Tier T1 (worker/ is a critical path). Procedure: AGENTS.md section 3, full council (Chair + seats A, B, C, D), then the advisor check. Head under review: 08a339e. Council lead: Sonnet 5.5. Chair of record: the owner.
Seats and models: A Scenarios (haiku), B Unit tests/verifiability (haiku), C Adversarial Skeptic, security (sonnet), D Historian (haiku). All four voted SUPPORT WITH CHANGES; the 3-of-4 pass rule is met; no dissent.

## Round 1

### Seat A (Scenarios), report, verbatim

VOTE: SUPPORT WITH CHANGES (read-only, nothing run or pushed; code read at origin/feat/contact-feedback 08a339e)

| # | Scenario | What happens (file:line) | Verdict |
|---|---|---|---|
| 1 | Flood, one IP | 5 validated posts/hour pass; 6th gets 429 (index.ts:722-724) | OK |
| 2 | Flood, many IPs or IPv6 | Key is hash of full IP (:721). IPv6 /64 gives unlimited buckets. Turnstile is the only real gate. | PROBLEM (inferred) |
| 3 | Rate-limit write before Turnstile | D1 row written at :722, siteverify at :744. Unsolved bodies create rows; rows are never deleted (evidence log). | PROBLEM, BLOCKING unless owner accepts |
| 4 | Turnstile siteverify 5xx/down | 502 (:756), but the slot was already burned. Five tries give 429 for an hour with nothing sent. Widget down: no token, 400, no burn (ContactPage:171-173). | PROBLEM (first half) |
| 5 | Turnstile slow | No timeout on siteverify (:744) or client fetch (ContactPage:146). "Sending..." hangs. | PROBLEM, non-blocking |
| 6 | Discord 429/5xx/webhook deleted | One attempt, no retry or queue (:776-791). Text kept in form (cleared only on success, ContactPage:152). Lost if tab closes. Slot burned. No alert. | PROBLEM, non-blocking |
| 7 | Secrets or webhook URL missing | 503 before upstream calls (:731-735). Verified. But it runs after the rate limit, and the client shows "check your message" (ContactPage:174-175). | OK on safety, PROBLEM on UX |
| 8 | Markdown, @everyone, links | Escaped (:666-668), allowed_mentions {parse: []} (:783). Embed size about 4.9k, under 6k (inferred). Link cap misses bare domains (:654-661). Discord linkify of bare domains UNVERIFIED. | OK (private channel) |
| 9 | Non-allowlisted origin | JSON content-type forces preflight, no ACAO means the browser blocks the POST (:244-251, :809). curl bypasses, so Turnstile applies. | OK |
| 10 | JS disabled | noscript notice (ContactPage:305). Form has no action; only the honeypot is named, so a click reloads with no data (inferred). Dead button. | OK, minor |
| 11 | Honeypot or min-fill bypass | Client-supplied; a direct POST passes (:706-711). Turnstile carries the weight. | OK (accepted) |
| 12 | PII in message, then deletion | Message goes to Discord only. D1 holds hash plus count (verified). Privacy page names no deletion route (PrivacyPage:74-82). | PROBLEM, non-blocking |
| 13 | No VITE_TURNSTILE_SITE_KEY | Amber notice, button disabled, script not loaded (ContactPage:65, 211, 298). | OK |
| 14 | Duplicates | No dedupe. Fresh token per send. Retry after network error can duplicate (ContactPage:179). | OK, minor |
| 15 | Site deployed before worker | Worker 404 shows as "check your message" (ContactPage:174). Ordering is a process guard only (PR body). | PROBLEM, non-blocking |
| 16 | Campus NAT | Whole shared IP gets 5/hour (inferred). | Note |

Triage check: triage/ISSUES-CONSOLIDATED.md on main has zero mentions of contact, feedback, Turnstile, Discord, or Privacy. No round-2 finding covers PR 125.

Required changes:
1. Move checkRateLimit (index.ts:722) to after successful siteverify (:760), or refund on failure. Blocks unless owner accepts the D1 row risk in writing. This is a T1 order change: amend the manifest.
2. Add AbortSignal.timeout to siteverify (:744), Discord (:776), and client fetch (ContactPage:146).
3. Client: separate 503/404 ("not set up yet") from Turnstile 400 (ContactPage:171-175).
4. Privacy: state how to request deletion of a Discord message (PrivacyPage:74-82).

### Seat B (Unit tests / verifiability), report, verbatim

VOTE: SUPPORT WITH CHANGES. Nothing below changes safety, scope, tier, or acceptance, so no blocking items. The suite proves most security claims. Three behaviours can regress without a failing test.

Verified runs (temp worktree, now removed; no tracked files changed): Worker tsc --noEmit clean; vitest run 16 files / 196 passed; feedback files alone 4 files / 47 passed. Root npm test: run 1 had 1 failure (QaChatPanel.veer.test.tsx "hidden/disabled when VITE_QA_API_BASE is unset"), runs 2 and 3 were 559/559; the PR does not touch that file (flake, pre-existing, inferred). PrivacyPage.test.tsx 8/8 on head 08a339e. Failing-first (verified): with the pre-08a339e PrivacyPage.tsx and the new test, 1 failed, 7 passed, with `expected ... to contain 'hashed with a fixed, non-secret salt'`.

Claim -> covering test -> mutation caught?
- 503 when secrets missing or webhook not Discord: route test :343, :358. Caught.
- Turnstile success check: :313. Caught.
- Hostname allowlist: :330, :337. Caught.
- remoteip: remoteip.test.ts:56, :74. Caught.
- Validation before rate limit: rate-limit-validation.test.ts:67. Caught.
- Rate limit before Turnstile/Discord: none. SURVIVES (only Discord-after-siteverify at ~:400 is asserted).
- 16 KiB cap: :260 (20,000 chars, streamed path). Caught for large bodies.
- Declared Content-Length cap: none. SURVIVES (executed: 41/41 pass with the branch disabled).
- Exact 16384/16385 boundary: untested (inferred).
- Field allowlist, lengths, email: :195-:246. Caught.
- Honeypot, min-fill: ~:216 cases. Caught.
- CORS allowlist: :392, :404. Caught (a `*` regression fails :404).
- Message escaping, allowed_mentions: :156, :167. Caught.
- Name/lesson/email escaping: none. SURVIVES (executed: 45/45 pass with the Name escape removed).
- redirect:'manual': :368. Caught.
- 5/hour/IP in D1: :281, :293, :302. Caught.
- Privacy wording: PrivacyPage.test.tsx. Text presence only.

Ordering: parse -> validation -> D1 rate-limit write -> free env-secret check -> Turnstile -> Discord. No expensive call precedes validation. The free secret check sits after a D1 write; this costs quota, not safety (inferred).

Untested or weak: startedAt is client-supplied, startedAt: 0 passes min-fill (speed heuristic only; Turnstile is the real gate). The Privacy test asserts strings, not code: "not deleted automatically yet" stays green if a cleanup is added. Verified: the cron (index.ts:910) cleans only DB_QA and no DELETE FROM rate_limit_counters exists. The 30-day Veer retention claim is UNVERIFIED. No test links the prerender snapshot wording to PrivacyPage.tsx (inferred).

Recommended non-blocking test additions: (1) rate-limited request and 503 request both make zero siteverify calls; (2) declared Content-Length over 16384 returns 413 without reading, 16384 accepted, 16385 rejected; (3) name, lesson, and email containing `*`, `_`, `@` are escaped in the embed; (4) Privacy: assert the snapshot and page carry the same retention sentence.

CI: "PR Worker gates" runs npm run typecheck and npm run test, so the feature's worker tests are gated. Deploy is workflow_dispatch only. Live Turnstile and Discord delivery are not exercised by any gate.

### Seat C (Adversarial Skeptic, security), report, verbatim

VOTE: SUPPORT WITH CHANGES. No BLOCKING issue found. Read: the diff, worker/src/index.ts, checkRateLimit in auth.ts, deploy-worker.yml, the Privacy and Contact pages. Did not run tests or exercise the live worker.

Verified, no finding:
- Turnstile fails closed. index.ts:735-738 returns 503 if either secret is unset or the webhook lacks the Discord prefix. No dev bypass. index.ts:763 requires success === true and a hostname in the allowlist. Secret only from env. (UNVERIFIED, low confidence: what hostname Turnstile dummy keys return.)
- Replay: each submission calls siteverify once, nothing cached; single-use is Cloudflare's behaviour (inferred).
- Rate limit race: the limiter is one atomic INSERT ... ON CONFLICT ... RETURNING (auth.ts:300-316), so QA R-23's race does not apply.
- Missing CF-Connecting-IP: index.ts:721 falls back to one shared feedback:ip:dev bucket at 5/hour. It fails closed. remoteip is simply omitted from siteverify.
- SSRF/redirects: webhook URL fixed from a secret and prefix-checked; redirect: 'manual' on both Turnstile and Discord calls.
- CORS: corsHeaders returns {} for non-allowlisted origins, no credentials; application/json forces a preflight; non-browser callers are stopped only by Turnstile and the rate limit.
- Discord embed: allowed_mentions {parse: []}; worst-case escaped embed about 5k chars (under 6000), description at most 4000 (limit 4096); link count capped at 5.
- Logging: no console.* in index.ts. Body capped at 16 KB (Content-Length and streaming).
- Deploy workflow: workflow_dispatch only, so PR code never sees secrets; secrets via env and `printf | wrangler secret put` stdin.
- Scope: no session.ts, gist-sync.ts, AuthBar.tsx, auth.ts or worker/src/qa/** changes; the only T1 path touched is worker/. (UNVERIFIED that the manifest declares exactly these files.)
- Privacy wording is honest: "fixed, non-secret salt", "pseudonymous, not anonymous", counter rows not cleaned up.

NON-BLOCKING, ranked:
1. Counter writes before Turnstile can exhaust the shared D1 (medium). index.ts:721-722 writes to env.DB before any Turnstile call, and env.DB also serves exam and auth. Exploit class: a client rotating through an IPv6 /64 sends well-formed bodies with any non-empty token string; each request creates a new row at no Turnstile cost; could exhaust D1 write quota or storage and degrade exam and auth (inferred; D1 plan limits not checked). Fix: key IPv6 on the /64 (hashIp(ip.split(':').slice(0,4).join(':'))), add a Cloudflare WAF rate rule on /api/feedback, record the cleanup sweep for rate_limit_counters (worker/src/qa/retention.ts is the likely place, UNVERIFIED it covers this table).
2. No global cap; Discord 429 reads as 502 to legitimate users (low-medium). Many-IP attackers with solved tokens can flood the channel or hit Discord's roughly 30/min webhook limit. Fix: a global bucket feedback:global of about 60/hour counted after Turnstile succeeds (a pre-Turnstile global bucket would let anyone starve it).
3. Shared-IP lockout (low): the per-IP counter increments before Turnstile, so a garbage-token sender on a shared NAT burns the 5/hour for everyone. Accept as a documented trade-off or move the increment after Turnstile.
4. Discord rendering (cosmetic): escapeDiscordMarkdown does not escape `<`, `:`, `@`, `-`, or newlines in name and lesson; bare https:// URLs stay clickable (a phishing link can reach the owner, capped at 5); no ping or injection possible. Fix: also escape `<` and `@` and collapse newlines in name and lesson.
5. Constant salt (informational): the salt sdm-exam-v1 is public and shared with the exam code; the hash is reversible by brute force; the Privacy text already says so.
6. Client-controlled startedAt (informational): any bot can set it to an old time.

### Seat D (Historian), report, verbatim

VOTE: SUPPORT WITH CHANGES.

Required before merge (privacy-accuracy acceptance conditions, treated as blocking):
1. Veer retention is overstated. The page says questions are "deleted after 30 days" (src/pages/PrivacyPage.tsx Veer section, ~L61; same string in src/components/qa/QaChatPanel.tsx:49 on main). Code: worker/src/qa/retention.ts:7-10 purges 30 days after the user's last session expires, and sessions last 30 days from login (worker/src/qa/oauth.ts:35). Inferred from code: up to about 60 days after the last question. Reword, or get the owner to record an accepted simplification.
2. Snapshot overclaims. scripts/seo/prerender.mjs:462 says the three features are "the only ways anything leaves your browser." The live page says they "can send something out" (PrivacyPage L24-27), and the same snapshot lists Hosting logs. Match the live wording.
3. Sign-in path omitted (inferred). The GitHub code exchange goes through the Worker (worker/src/index.ts:60, POST /auth/github/exchange). The page says only "session storage", and README:15 says "no course server in between." Disclose the exchange hop. Whether the Worker retains tokens is UNVERIFIED.

Verified fixed in the final diff: B1 (the snapshot now says "three" and includes the Veer section, prerender.mjs:462); B2 (CLAUDE.md has zero diff vs main); "third way" (live page L24-27 and the Veer section name it).

Scope and record gaps: the diff is 21 files, +1950/-19; the PR body (line 13) still says "14 scoped files", so it is stale; the 7 extras were added before the manifest amendment (EVIDENCE f2dcd70 correction). No council votes exist in the repo; the body's 4/4 claim is unrecorded. Precedent: PR #112's Manifest v2 "PASS unanimous 4/4" is in EVIDENCE_LOG.md on main (~L152). Browser e2e and recording not run, as the PR states.

Downstream rebase impacts: #164 (W2, T1): the PR adds a "Store feedback secrets" step to deploy-worker.yml and W2 scopes that file (expect a textual conflict; worker deploy must still run before the site deploy). #151 (L4): the PR edits README.md:15; R-02 is still open (README:13/21/23 and docs/ai-tutor.md:3,108 say "no server" and none mention Veer). #152 (L5): prerender.mjs (+54 lines) and generate-sitemap.mjs (hard-coded !== 46 check) overlap the slice.

### Verdict (council lead, Sonnet 5.5), round 1

Pass rule met (4 of 4 support, no dissent). Required changes before the advisor check closes (each is T1, so tests first, a manifest amendment, and the PR body corrected):
1. **Rate limit after Turnstile.** Move checkRateLimit to after a successful siteverify (so garbage tokens create no D1 rows and a Turnstile 5xx burns no slot); key IPv6 on its /64. Amend the manifest: the order change is part of T1 scope.
2. **Timeouts and client messages.** AbortSignal.timeout on siteverify, the Discord call, and the client fetch; ContactPage distinguishes 503/404 ("not set up yet") from a Turnstile 400.
3. **Privacy accuracy.** Veer retention wording matches the code (up to about 60 days after the last question, or whatever the code proves); the prerender snapshot matches the live page ("can send something out"); disclose that the GitHub sign-in code exchange passes through the Worker; state how to request deletion of a Discord message; README line stays consistent.
4. **Tests to close the surviving mutations:** Content-Length cap (413) and the 16384/16385 boundary; name, lesson and email escaping; zero siteverify calls on a rate-limited or 503 request is replaced by the new order (rate limit only after siteverify success) with the matching test; one test asserting the snapshot and the page carry the same retention sentence.
5. **Escaping:** also escape `<` and `@` and collapse newlines in name and lesson (cosmetic hardening, in scope, cheap).
6. **Record:** correct the PR body ("14 scoped files" to the real count with the exception justified), keep this council record on the branch.
Non-blocking, tracked not built: a global feedback bucket after Turnstile; a Cloudflare WAF rate rule on /api/feedback (owner step, added to the owner list); a cleanup sweep for rate_limit_counters (issue #176); a secret salt (issue #176).

Round count: 1 of 2. Sent to the advisor next; the reply is recorded in the following commit.

### Advisor (Opus), reply, round 1, verbatim

DISAGREE. The record is not on the PR, and one verdict item is wrong. Two problems, the first mechanical, the second substantive.

MATERIAL: you pushed the council record to the wrong branch. Your own command output says it: `## feat/contact-feedback-sync...origin/feat/contact-feedback-sync [ahead 2]`, and `git push origin HEAD:feat/contact-feedback` reported `0 0` against `origin/feat/contact-feedback`. That worktree is on `feat/contact-feedback-sync`, not `feat/contact-feedback`. PR #125's head is `08a339e` on `feat/contact-feedback`. Verify with `gh pr view 125 --json headRefOid` and `git log --oneline -1 origin/feat/contact-feedback`. If `cd23653` is not an ancestor of the PR head, the record is on a side branch and step 3 of the procedure is unsatisfied: the reports must be in the record on the remote before the advisor call. Fix the push target, then re-consult.

MATERIAL: verdict item 1 contradicts Seat B's measurement. You adopted Seat A's "move `checkRateLimit` to after successful siteverify." Seat B measured the actual order as: parse, validation, D1 rate-limit write, free env-secret check, Turnstile, Discord, and separately recorded a test at `rate-limit-validation.test.ts:67` pinning validation before rate limit. Moving the limiter after siteverify means every unauthenticated request now reaches Cloudflare's siteverify before any per-IP throttle exists: you trade "garbage tokens write D1 rows" for "garbage tokens cause unbounded outbound siteverify calls." Seat C independently rated the D1 exhaustion non-blocking, medium, and Seat A's own "BLOCKING" was qualified as "unless owner accepts." Seat C already gave the cheaper fix that both seats support: key IPv6 on the /64 so the bucket space is bounded, plus refund-on-siteverify-failure if you want the slot back. That removes the exhaustion vector without inverting the throttle order. Decide between "move the limiter" and "bound the key space". Whichever you pick, the T1 manifest amendment must name it, and Seat B's existing ordering test will need updating either way.

One more thing: Seat D reports the PR body still says "14 scoped files" against a real diff of 21 files, +1950/-19. AGENTS.md section 4 caps a manifest at 3 scoped files with exceptions justified. Correct the count and the justification in the same pass as the other fixes.

Not blocking, but note it in the record: all four seats flagged privacy-wording items (retention ~60 days, snapshot overclaim, the sign-in exchange hop through the Worker). Those are the same class as QA R-24, which is already a tracked finding; say so in the record so the Chair sees that #125 is now absorbing part of another slice's scope.

Sequencing: do not re-run the council. This is one round of corrections inside round 1. Fix the push target, resolve the rate-limit question with the manifest amendment, correct the file count, then come back. Round count stays 1 of 2.

### Lead's response and revised verdict (v2), round 1

1. Push target: checked, not a defect. `gh pr view 125 --json headRefOid` returns `cd23653` and `git rev-parse origin/feat/contact-feedback` is `cd23653`; `git merge-base --is-ancestor cd23653 origin/feat/contact-feedback` succeeds, and `git show origin/feat/contact-feedback:docs/council/2026-11-02-pr125-contact-feedback.md` returns this file. The `[ahead 2]` line the advisor quoted was the worktree's own sync branch (`feat/contact-feedback-sync`) before the push; the push target `HEAD:feat/contact-feedback` is the PR branch, and the PR head is now `cd23653`. The reports were therefore on the remote before the first advisor call. (PR head was 08a339e before this record landed; it is now cd23653.)
2. Rate limit: ACCEPTED. Verdict item 1 is replaced. The limiter stays AFTER validation and BEFORE Turnstile (no unbounded siteverify calls). The D1 exhaustion vector is bounded by (a) keying IPv6 on its /64 prefix so the bucket space is bounded by the attacker's address space and not by free IPv6 rotation, and (b) refunding the slot when siteverify itself fails with a 5xx or network error, so a Cloudflare outage does not lock out five legitimate users per IP. Cleanup of old counter rows and a secret salt stay in issue #176; a Cloudflare WAF rate rule on /api/feedback is added to the owner's setup steps. The T1 manifest amendment names this choice. The ordering test (validation before rate limit, rate limit before Turnstile) is kept and a refund test is added.
3. File count: the real diff is 22 files (gh pr view 125 --json files) and +1950/-19; the PR body must state the real count and justify the exception (feature = 1 route + 1 page + 1 privacy page + tests + prerender/sitemap/deploy workflow + docs). To be corrected in the PR body in the same pass.
4. Scope note for the Chair: the three privacy-wording items (Veer retention about 60 days versus the claimed 30, the prerender snapshot overclaim, the sign-in exchange hop) overlap QA R-24 (retention wording, slice P1e, issue #158) and INT R-02/R-16 (docs slice L4, issue #151). #125 absorbs the page-level fixes in its own files; the README/ai-tutor/architecture docs and the QaChatPanel retention string remain in those slices.

Revised required changes (replace verdict items 1 to 6 where they differ):
1. IPv6 /64 keying; refund on siteverify 5xx or network error; limiter order unchanged; tests: ordering, /64 bucketing, refund.
2. AbortSignal.timeout on siteverify, the Discord call, and the client fetch; ContactPage separates 503/404 from a Turnstile 400.
3. Privacy accuracy: Veer retention wording matches code; snapshot matches the live page; sign-in exchange hop disclosed; deletion route for Discord messages stated.
4. Tests for the surviving mutations: Content-Length cap and 16384/16385 boundary; name, lesson and email escaping; one test that the snapshot and the page carry the same retention sentence.
5. Escape `<` and `@` and collapse newlines in name and lesson.
6. PR body: real file count and the exception justified; this record stays on the branch.

Round count: 1 of 2 (per the advisor, corrections inside round 1). Sent to the advisor again; the reply is recorded in the following commit.
