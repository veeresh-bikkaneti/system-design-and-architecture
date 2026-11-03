Handoff 2026-11-03T00:40Z | origin/main 647b1c7 | open PRs #109 #135 #185 #193 #194 (verify: `git rev-parse origin/main`, `gh pr list`; a mismatch means this file is stale)

# Next-agent handoff (snapshot 2026-11-02, night)

Read this first, then `AGENTS.md`. The remote is the record: GitHub issues #143-#193, PRs, `triage/README.md`, and the council records in `docs/council/`. Re-verify anything below with `gh pr list`, `gh issue list --label round-2-triage`, `git log origin/main`.

## 1. The prompt (paste this to the next agent)

> You are taking over the System Design Mastery repo (veeresh-bikkaneti/system-design-and-architecture). Follow `AGENTS.md` exactly. Start with `triage/NEXT-AGENT.md`, then run `gh pr list`, `gh issue list --label round-2-triage`, and `git fetch && git log --oneline origin/main -10` to verify the state it describes before acting. Hard rules. Never merge anything that is not fixed: no unresolved blocking finding, every required check green ON THE CURRENT HEAD, and an independent Reality Checker review of the latest push; a finding the reviewer marks non-blocking is recorded in an issue. The remote is the source of truth: push after each commit, open a PR at the first push, never force-push, keep nothing only local. T1 work (`worker/`, `src/store/session.ts`, `src/lib/gist-sync.ts`, `src/components/AuthBar.tsx`) needs the full four-seat council and then the advisor. Use the council procedure in `AGENTS.md` section 3: Sonnet 5.5 is the council lead and writes the verdict, Opus is the advisor, the loop is bounded by section 9, and the seat reports and the verdict are pasted into `docs/council/` on the remote BEFORE the advisor is consulted. Reviewers and seats read the evidence with `git show origin/main:triage/ISSUES-CONSOLIDATED.md`. Ask the owner only about the domain (see section 4 and the rule in PR #193 once merged); technical questions are settled by the council and the advisor. When you must ask, send one batched message in the format in `docs/agent-notes.md` ("Owner question format"). Keep this file current at every checkpoint (a merge, a verdict, a PR opened or closed, an owner decision, an agent started or finished). Report in the ADHD shape: next action first, numbered steps, plain words, one concrete next action last.

## 2. On main (verified)

Main is `647b1c7`. Merged this session: #125 contact form + privacy page + worker endpoint (T1, full council, independent review), #174 Ben output gate (3 independent review rounds), #186 stripTags fix (2 rounds), #175 TTS extractor, #170 PR gates CI, #182/#183 handoff and checkpoint rule, #140, #141, #142, #169, #171, #172, #173 and others. #177 lesson content (merged 647b1c7; its deploy and Ben eval gate passed). All `main` deploys are green through `647b1c7`. Ruleset `Protect main branch` requires `PR Frontend gates` and `PR Worker gates`, thread resolution, last-push approval and one approval; admin bypass stays.

## 3. In flight

| PR | What | State | Next action |
|---|---|---|---|
| #109 | PWA (T1) | Merged main in, 4-seat council + advisor done (record: `docs/council/2026-11-02-pr109-pwa.md` on branch `feat/pwa`). Owner decisions 1 and 2 recorded (comment on the PR). An implementer is applying the council's required changes: sync-race counter in `session.ts`, denylist so the service worker never answers `sitemap.xml`, `feed.xml`, `llms.txt`, `robots.txt`, audio with the app shell, header check + recovery runbook (no watchdog), a CI test at the real Pages subpath, a service-worker scope guard, T1 tests, PR body fixes, follow-up issues #188-#192. Last CI was pending on head 39d35ad. | When the implementer reports: verify `gh pr checks 109` on the exact head (all green, CodeQL clean), then an independent Reality Checker re-runs the 9 mutation checks plus the scope guard. Merge needs owner decision 3 (see section 4). |
| #177 | MERGED (647b1c7) | Council + advisor decided the eval trade-off (record: `docs/council/2026-11-02-eval-tradeoff.md`, PR #194). Narration for caching-strategies, designing-ai-systems, agentic-ai-patterns is stale until audio regeneration (#178). | Nothing. |
| #135 | Chunker (fragments 189 to 0) | Parked. Council Skeptic: re-measure after the batching fix, merge only if drift has slack and the off-course case is explained by mechanism. | Waits for the batching fix. |
| #193 | Rule: ask the owner domain questions only (draft) | Skeptic voted support with changes; all changes applied; record `docs/council/2026-11-02-escalation-domain-only.md` on branch `docs/escalation-domain-only`. | Consult the advisor, record the reply, mark ready, merge when checks are green and the owner has seen it. |
| #185 | This rolling handoff (draft) | Updated at each checkpoint by pushing to branch `docs/handoff-2026-11-02-late`. | Merge when green. |

Not started: L4 docs pass (#151), L5 site counts (#152), W2 Veer corpus refresh (#164, T1), P1a panel focus (#155), W1/W3/W4/S1/S2 (T1, need DEC-1..6 in #147), L1, L2, C3, Q1. Held: `fix/ben-index-batch-1` (66a3ef0), `experiment/drift-m3`, `experiment/drift-m4` (evidence).

## 4. Owner (domain) items, nothing else needs the owner

1. **Decision 3 on #109.** Earlier PWA records cite "Dinesh's go". `AGENTS.md` section 11 names Liz as Chair. Who approved those records? (Open; the merge of #109 waits for it.)
2. `REPORT-round2.md` (coursework-integrity): 38 findings have no titles (issue #167).
3. #125 setup: Discord channel + webhook, Cloudflare Turnstile site for the two hosts, secrets `DISCORD_FEEDBACK_WEBHOOK_URL` and `TURNSTILE_SECRET_KEY`, variable `VITE_TURNSTILE_SITE_KEY`, a Cloudflare WAF rate rule on `/api/feedback`, run Deploy Worker, test a real submission. Until then the form shows "spam check is not set up yet" and Send is disabled.
4. #178: regenerate narration audio (164 files, 313 MB; needs the owner's speech-synthesis setup; `.git` is already 333 MB).
5. DEC-1..6 in #147 (product and security policy choices).
Already decided by the owner: #109 decision 1 (the `session.ts` scope expansion is signed off) and decision 2 (the broken-deploy residual risk is accepted, no watchdog in the PR).

## 5. Decisions already made by the council (do not re-ask the owner)

- Eval trade-off (#180, #177, #135) DECIDED by council and advisor under the owner's standing instruction (record `docs/council/2026-11-02-eval-tradeoff.md`, PR #194): #177 merged; NEXT Ben task = the batching fix (BATCH=1 or fixed deterministic batching, determinism test, the council-4 conditions, current holdout folded into `cases.json`, a new blind holdout of about 100 cases written by a FRESH agent whose brief names only `content/lessons/` and forbids `evals/`, REPORT.md, router code and scratch files, with the paths it was given recorded); trigger: open it as a draft PR within one working session of #109 merging, otherwise ask the owner a scheduling question; then re-measure #135 on that base (merge only if fragments are 0, drift at most 2.9% with one case of slack or a recorded case review, accuracy at least 85%, top-3 at least 90%, and the off-course case `h-d-ai-art` explained by mechanism); make `eval:ben` a required check only after about 10 clean runs.
- Council cap per task: T3 none, T2 about 40-60k tokens, T1 about 100-150k; stop with `BUDGET EXCEEDED` rather than overspend.

## 6. Lessons that cost time

- A PR opened BEFORE a gate existed does not run it; check `gh pr checks` on the current head. A pushed commit moves the head, so gates and reviews are re-confirmed on the new head.
- An agent that keeps pushing after its PR merged orphans commits; check `git merge-base --is-ancestor <sha> origin/main` before calling work done.
- A security fix that adds a sanitizer can itself raise a CodeQL alert; run the code-scanning check before calling it done.
- Council seats that read the owner's main checkout cannot see `triage/`; use `git show origin/main:triage/...`.
- The advisor tool forwards the whole transcript: put seat reports in the repo record first, consult in the same session.
- Git Bash: avoid multi-line `node -e` or heredoc edits (quoting breaks, CRLF makes edits miss); use the file tools and confirm each edit landed.
- Agents die on network errors, rate limits and session ends; check the branch and PR state first, then resume or relaunch with a self-contained brief. A stopped agent cannot be resumed after the session ends.
- Local machine and permission details stay out of this public file (see `docs/agent-notes.md`).

## 7. Tools

Code-only graph of `src/` (derived, gitignored): `graphify update src`. The full semantic graph needs `/graphify` in an assistant session.
