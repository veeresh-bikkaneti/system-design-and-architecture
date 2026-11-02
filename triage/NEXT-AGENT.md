# Next-agent handoff (snapshot 2026-11-02, evening)

Read this first, then `AGENTS.md`. The remote is the record: GitHub issues #143-#180, PRs, and `triage/README.md`. Anything below can be re-verified with `gh pr list`, `gh issue list --label round-2-triage`, `git log origin/main`.

## 1. The prompt (paste this to the next agent)

> You are taking over the System Design Mastery repo (veeresh-bikkaneti/system-design-and-architecture). Follow `AGENTS.md` exactly. Start with `triage/NEXT-AGENT.md`, then run `gh pr list`, `gh issue list --label round-2-triage`, and `git fetch && git log --oneline origin/main -10` to verify the state it describes before acting. Hard rules: never merge anything that is not fixed (no unresolved findings, gates green ON THE CURRENT HEAD, an independent Reality Checker review of the latest push); the remote is the source of truth (push after each commit, PR at first push, no force-push, nothing only local); T1 work (worker/, session.ts, gist-sync.ts, AuthBar.tsx) needs the full council then the advisor; merging needs the owner's explicit word per PR or their standing instruction "take over and merge clean PRs". Use the council procedure in `AGENTS.md` section 3 (Sonnet 5.5 council lead writes the verdict, Opus advisor checks it, loop bounded by section 9, record on the remote BEFORE the advisor call). Seat reports and reviewers must read the evidence with `git show origin/main:triage/ISSUES-CONSOLIDATED.md`. Ask the owner only for: merges, repo/account settings, missing input. Decide everything else and report afterwards, in the ADHD shape (next action first, numbered steps, one concrete next action last).

## 2. What is on main (verified 2026-11-02)

Main is at `385e411` or later. Merged this session: #132 docs, #140 Ben setup pin (4 Reality Checker rounds), #141 triage board, #142 never-merge-unfixed + remote-is-truth rules, #169, #170 PR gates CI, #171 council records, #172 council procedure, #173 probe fix (my mistake broke main for ~25 minutes, fixed), #175 TTS extractor fix (L3).
Ruleset `Protect main branch` (24196526) now requires checks `PR Frontend gates` + `PR Worker gates`, thread resolution, last-push approval, 1 approval; admin bypass stays.

## 3. In flight (all pushed to the remote)

| PR | What | State | Next action |
|---|---|---|---|
| #174 | O1 Ben output gate (QA R-01, output side) | Independent RC found BLOCKING B1 (leak shapes slip past when wrapped in list/table/fence). Council round 2 of 2 done, advisor AGREE. Agent implementing the tiered sanitizer. | Fresh Reality Checker at the final head must re-run its bypass table red-before-green. Merge only if no BLOCKING and checks green on that head. Title/body must say "Refs R-01, does not close it" (follow-up #179). |
| #125 | Contact/feedback form + privacy page + worker POST /api/feedback (T1) | 4-seat council done, advisor AGREE. Agent implementing 6 fixes: IPv6 /64 key, refund on siteverify 5xx, timeouts, privacy wording (Veer retention ~60 days, snapshot, sign-in exchange hop), tests, escaping, PR body = real file count (22). | Fresh Reality Checker at the final head. Needs owner infra before it works live (see section 5); code fails closed (503) without secrets, deploy-worker is manual. |
| #177 | C2 lesson content: cache warming, reranking, agentic trio | Agent done; Nishtala claim verified in the paper; Ben eval 87.6% vs main 88.1% explained by issue #180. Independent RC running. | Read RC verdict. Merge only with RC clean AND the owner's call on the eval trade-off (see #180). |
| #135 | Chunker (fragments 189 to 0) | Merged main in, passes gates, but accuracy 88.1 to 86.1, drift 2.9% vs 3% gate, h-d-ai-art now answers off-course. PARKED. | Owner decision together with #177 (issue #180). Optionally try fixing the off-course case without touching eval cases. |

Not started: #109 PWA (T1, 4 conflicts, collides with QaChatPanel/gist-sync/AuthBar/index.html, so Dev B panel work and S1/W4 wait for it), L4 docs pass (#151), L5 site counts (#152), W2 Veer corpus refresh (#164, T1), P1a panel focus (#155), W1/W3/W4/S1/S2 (T1, need DEC-1..6 in #147), L1, L2, C3, Q1.
Held: `fix/ben-index-batch-1` (66a3ef0, BATCH=1, owner hold, no PR). Experiments: `experiment/drift-m3`, `experiment/drift-m4` (WIP, not for merge).

## 4. Owner decisions and inputs still open (nothing else needs them)

1. `REPORT-round2.md` (coursework-integrity): 38 findings have no titles (issue #167). The file was never found on any machine.
2. Eval trade-off for #177 and #135 together; root cause is issue #180 (ben:index embeds in batches of 32, so adding any chunk shifts unrelated vectors): fix the batch sensitivity first (BATCH=1 plus a new blind holdout, ADR 0001 section 7) or accept small score moves.
3. #178: regenerate narration audio for all lessons: 164 files, 313 MB, `.git` is already 333 MB; needs a machine with the TTS venv. The extractor fix (#175) is merged; shipped audio stays stale until then.
4. DEC-1..6 in #147 (assessment semantics, token scope, headers, history TTL, build stamp, chunker base) unblock the T1 slices.
5. #109 and #125: keep or shelve; #125 needs setup (section 5).

## 5. Owner setup for #125 (code cannot do these)

1. Private Discord channel + webhook. 2. Cloudflare Turnstile site (managed) for `veeresh-bikkaneti.github.io` and `systemdesignandarchitecture.knowledgetest.workers.dev`. 3. Repo secrets `DISCORD_FEEDBACK_WEBHOOK_URL`, `TURNSTILE_SECRET_KEY`. 4. Repo variable `VITE_TURNSTILE_SITE_KEY` (and `VITE_WORKER_URL` if unset). 5. Cloudflare WAF rate rule on `/api/feedback`. 6. Run "Deploy Worker" from Actions, redeploy the site, test a real submission at `/contact`. Follow-up issue #176: rate-limit counter rows are never deleted; constant public salt.

## 6. Lessons that cost time (do not repeat)

- A PR opened BEFORE a gate existed does not run it. Check `gh pr checks` on the current head, never assume. (#171 broke `npm test` on main with `*.test.ts` probe files.)
- A pushed fix commit moves the head: gates and reviews must be re-confirmed on the new head.
- Council seats that read the owner's main checkout cannot see `triage/` (untracked there): always `git show origin/main:triage/...`.
- The advisor tool forwards the whole transcript: paste seat reports into the repo record first, consult in the same session.
- Git Bash: avoid multi-line `node -e`/heredocs for edits (quoting breaks); use the file tools. CRLF working copies can make edits silently miss.
- Permissions: the owner runs `claude --dangerously-skip-permissions`; `~/.claude/settings.json` defaults to bypass; Orca hooks were removed (backups beside the file).
- Agents die on network errors: resume them with SendMessage; never relaunch blindly (check `git status` in their worktree first).

## 7. Tools state

Code-only graphify graph of `src/` (954 nodes, 1967 edges) is at `src/graphify-out/` (local, derived, gitignored). Rebuild with `graphify update src`. Full semantic graph needs `/graphify` in an assistant session.
Council cap: sized per task (T3 none, T2 about 40-60k tokens, T1 about 100-150k); stop with `BUDGET EXCEEDED` rather than overspend.
