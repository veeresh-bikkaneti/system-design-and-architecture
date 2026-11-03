Handoff 2026-11-03T02:10Z | origin/main b88c2e5 | open PRs #135 #185 #193 #194 #195 (verify: `git rev-parse origin/main`, `gh pr list`; a mismatch means this file is stale)

# Next-agent handoff (snapshot 2026-11-02, night)

Read this first, then `AGENTS.md`. The remote is the record: GitHub issues #143-#193, PRs, `triage/README.md`, and the council records in `docs/council/`. Re-verify anything below with `gh pr list`, `gh issue list --label round-2-triage`, `git log origin/main`.

## 1. The prompt (paste this to the next agent)

> You are taking over the System Design Mastery repo (veeresh-bikkaneti/system-design-and-architecture). Follow `AGENTS.md` exactly. Start with `triage/NEXT-AGENT.md`, then run `gh pr list`, `gh issue list --label round-2-triage`, and `git fetch && git log --oneline origin/main -10` to verify the state it describes before acting. Hard rules. Never merge anything that is not fixed: no unresolved blocking finding, every required check green ON THE CURRENT HEAD, and an independent Reality Checker review of the latest push; a finding the reviewer marks non-blocking is recorded in an issue. The remote is the source of truth: push after each commit, open a PR at the first push, never force-push, keep nothing only local. T1 work (`worker/`, `src/store/session.ts`, `src/lib/gist-sync.ts`, `src/components/AuthBar.tsx`) needs the full four-seat council and then the advisor. Use the council procedure in `AGENTS.md` section 3: Sonnet 5.5 is the council lead and writes the verdict, Opus is the advisor, the loop is bounded by section 9, and the seat reports and the verdict are pasted into `docs/council/` on the remote BEFORE the advisor is consulted. Reviewers and seats read the evidence with `git show origin/main:triage/ISSUES-CONSOLIDATED.md`. Ask the owner only about the domain (see section 4 and the rule in PR #193 once merged); technical questions are settled by the council and the advisor. When you must ask, send one batched message in the format in `docs/agent-notes.md` ("Owner question format"). Keep this file current at every checkpoint (a merge, a verdict, a PR opened or closed, an owner decision, an agent started or finished). Report in the ADHD shape: next action first, numbered steps, plain words, one concrete next action last.

## 2. On main (verified)

Main is `b88c2e5`. Merged this session: #125 contact form + privacy page + worker endpoint (T1, full council, independent review), #174 Ben output gate (3 independent review rounds), #186 stripTags fix (2 rounds), #175 TTS extractor, #170 PR gates CI, #182/#183 handoff and checkpoint rule, #140, #141, #142, #169, #171, #172, #173 and others. #177 lesson content (merged 647b1c7; its deploy and Ben eval gate passed). #109 PWA (merged b88c2e5; deploy green; live check posted on the PR: service worker registers at the Pages scope, sitemap/robots/feed/llms.txt are real files, home page renders). All `main` deploys are green through `b88c2e5`. Ruleset `Protect main branch` requires `PR Frontend gates` and `PR Worker gates`, thread resolution, last-push approval and one approval; admin bypass stays.

## 3. In flight

| PR | What | State | Next action |
|---|---|---|---|
| #109 | MERGED (b88c2e5) | Owner decision 3 closed ("ignore what Dinesh said; merge if the PWA goal is met and nothing broke"). Independent review verified with concerns, no blocking finding; live check passed. Follow-ups #188-#192. | Nothing. |
| #177 | MERGED (647b1c7) | Council + advisor decided the eval trade-off (record: `docs/council/2026-11-02-eval-tradeoff.md`, PR #194). Narration for caching-strategies, designing-ai-systems, agentic-ai-patterns is stale until audio regeneration (#178). | Nothing. |
| #135 | Chunker (fragments 189 to 0) | Parked until the batching fix (trigger: draft PR within one working session of #109 merging, queued after M1; if M1 is not merged by the end of the next working session, ask the owner a scheduling question). | Batching fix, then re-measure. |
| #195 | Slice M1: Ben model load never blocks the chat (QA R-02, T2, draft) | Council + advisor AGREE (record `docs/council/2026-11-03-m1-ben-model-load.md`). M1a (inference.ts: two-stage bound 120 s/60 s as UNVERIFIED defaults, cancel, retry only from cancelled, getLoadTiming) and M1b (QaChatPanel.tsx: composer never locked by model loading, provisional label, Stop loading, Try again) implemented; 734/734 tests, e2e 34/34. Independent review running on head 1e48ee7. M1c (R-27 version stamp) deferred. | Read the review; fix BLOCKING; add the manifest judgment call (idle counts as not ready, so a first model-only question gets the deterministic answer and starts no load). Then merge. NOBODY may claim the Ben fix until a fresh-profile throttled-network run records getLoadTiming() (needs a real WebGPU browser; the owner or /browse). |
| #194 | Eval trade-off record (draft) | Advisor AGREE. | Merge (docs only). |
| #193 | Rule: ask the owner domain questions only (draft) | Skeptic voted support with changes; all changes applied; record `docs/council/2026-11-02-escalation-domain-only.md` on branch `docs/escalation-domain-only`. | Consult the advisor, record the reply, mark ready, merge when checks are green and the owner has seen it. |
| #185 | This rolling handoff (draft) | Updated at each checkpoint by pushing to branch `docs/handoff-2026-11-02-late`. | Merge when green. |

Not started: L4 docs pass (#151), L5 site counts (#152), W2 Veer corpus refresh (#164, T1), P1a panel focus (#155), W1/W3/W4/S1/S2 (T1, need DEC-1..6 in #147), L1, L2, C3, Q1. Held: `fix/ben-index-batch-1` (66a3ef0), `experiment/drift-m3`, `experiment/drift-m4` (evidence).

## 4. Owner (domain) items, nothing else needs the owner

1. Decision 3 on #109: CLOSED by the owner (see the table). Nothing is waiting here.
2. `REPORT-round2.md` (coursework-integrity): 38 findings have no titles (issue #167). The owner says it came from their own e2e QA session earlier on 2026-11-02. A message was sent to their cloud session asking it to push the files to a branch `docs/round2-reports` (check `git ls-remote origin docs/round2-reports`); it cannot reply. If the files appear, build the 38 titles from them.
3. #125 setup: Discord channel + webhook, Cloudflare Turnstile site for the two hosts, secrets `DISCORD_FEEDBACK_WEBHOOK_URL` and `TURNSTILE_SECRET_KEY`, variable `VITE_TURNSTILE_SITE_KEY`, a Cloudflare WAF rate rule on `/api/feedback`, run Deploy Worker, test a real submission. Until then the form shows "spam check is not set up yet" and Send is disabled.
4. #178: DEFERRED by the owner (no chapter lacks audio; the extractor bug only dropped trailing sections from the recordings; re-recording is optional polish at about 313 MB). Do not re-record.
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
