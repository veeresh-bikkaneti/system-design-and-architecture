# Council 3, Seat D (Historian): repo history for Q1, Q3, Q4

Scope: read-only. Git queries on `origin/main` (head c4b17dd, #131). Nothing run, nothing edited. `gh` not queried, so CI run history is UNVERIFIED.

## Verdict on the joint direction
APPROVE WITH CONDITIONS. The history supports the fix direction. C1' reverses a decision recorded in #34, so it needs a written record and a Chair acknowledgment. Conditions below.

## Q1. Is the Keaton bug real on origin/main, and is the fix the same as C1'?
- **Verified:** the bare-vote self branch was removed in **4977a33** ("Fix Ben answering as himself for unrelated 'who is X' questions (#34)", 2026-09-24). `git merge-base --is-ancestor 4977a33 origin/main` returns yes. Pickaxe `-S "bare"` and `-S "vote"` on router.ts both hit 4977a33.
- **Verified:** main already carries the fix. router.ts:267-273 says "No bare-vote self branch here". The self-answer symptom from #34 is therefore fixed on main.
- **Verified:** the self action is still reachable only through the rule layer. router.ts:245-247 is `isFollowUp(question) || (isAboutTutor(question) && !(offCourse && vote.confidence >= ruleVeto))`.
- **UNVERIFIED:** the m3 claim that "Who is Michael Keaton" on main is answered from a 0.45-0.62 lesson. Likely path: the 0.45 lesson gate at router.ts:~300 (THRESHOLDS.lesson, router.ts:42) after a self vote falls through. I did not run it. The historian can't confirm the current behaviour.
- **Verified:** C1' is not the #34 code. c1p-c2.diff adds a new `if (vote.intent === 'self')` block that returns only `redirect`, or `lesson` at confidence 0.62 or higher with a vote under 0.6. It never returns `action: 'self'`.
- **Conflict (verified):** C1' does reverse the stated #34 decision. #34's commit body and router.ts:267-273 say "An unconfirmed 'self' vote now falls through to the rest of the policy table". C1' redirects instead. drift-review-c2.md R2 acknowledges this. The old comment at router.ts:267-273 must be rewritten, and ben-history.md section 7 needs a matching sentence.
- **Not a conflict:** ADR 0001 section 4 table (ADR:~110-120) lists "anything else | low | redirect", which fits C1'.

## Q3. Sequencing and re-baselining precedent
- **Verified:** main was built one PR at a time: #127 (4c744aa), #128 (ab036c8), #129 (7b9deb4), #130 (024db43), #131 (c4b17dd). Each one carried its own eval result in EVIDENCE_LOG.md.
- **Verified:** eval re-baseline precedent in EVIDENCE_LOG.md:123 and :198. The branch is scored against a same-environment pristine-main run, and the regenerated REPORT.md is not committed when it does not reproduce locally. :198 gives "top-1 92.9% / top-3 95.9%" as the main baseline. :225 and :244 repeat the rule.
- **Verified:** REPORT.md is only regenerated on main in f5161ca (41-lesson corpus). `git log -- evals/ben/REPORT.md` shows nothing else.
- **Verified:** holdout.json last changed in ebd7f6d (#33). ADR section 7 (ADR:140-160) still says it is scored, never tuned against. C2's drift fix is therefore tuned against cases.json and the holdout is contaminated, as drift-review-c2.md condition 3 says.
- **Implication:** #134 first, then the drift PR at BATCH=1, then #135, matches the precedent of one PR per measured change. Re-measure after each merge on the rebased head.
- **Deferring #135:** the fragment-fix value is independent of router.ts (chunker only). Nothing in history ties it to the router change. Deferral is safe as far as history shows. UNVERIFIED: whether the 30 broken chunks are currently served on main.

## Q4. Does CI on PRs run eval:ben or any Ben test?
- **Verified:** no. `.github/workflows/deploy.yml:6-9`: `on: push: branches: [main]` plus `workflow_dispatch`. No `pull_request` trigger.
- **Verified:** the Ben gates live only in deploy.yml's `checks` job: `npm run test` at :34, `ben:index` at :37, `eval:ben` at :38.
- **Verified:** `codeql.yml:7-9` runs on `pull_request` but runs CodeQL only.
- **Verified:** `deploy-worker.yml` is `workflow_dispatch` only, and no Ben tests run there.
- **Precedent:** docs/ben-history.md:119-121 says "Every PR in this history was manually dispatched on its own branch". Whether each dispatch happened is UNVERIFIED (gh run history not queried).
- **UNVERIFIED:** whether the deploy job depends on `checks`, so a red eval would block deploy but not merge. Confirm in deploy.yml before writing the ticket.

## Conditions (numbered, testable)
1. The final diff touches only router.ts, semantic.test.ts, REPORT.md, EVIDENCE_LOG.md and the ben-history section 7 sentence. router.ts:267-273 comment is rewritten to match C1'. Test: `git diff --stat` shows those files and nothing else.
2. The PR body and EVIDENCE_LOG say explicitly that C1' reverses #34's fall-through and that the self branch is still never Ben's own answer. Test: grep for "falls through" in the PR body gives the reversal.
3. Rebase on main after #134 merges, then `npm run ben:index && npm run eval:ben`. Paste REPORT.md. Run on Linux, or label Windows-only UNVERIFIED.
4. The ticket for CI protection (Q4) is opened before merge and names deploy.yml as the place to add a `pull_request` job that runs `npm test` and `eval:ben`. It is a ticket, not scope.
5. The holdout ticket (fold holdout.json into cases.json, write a new holdout) is opened before merge, per ADR section 7.

## Chair-only decisions
- Accept the reversal of #34's fall-through (C1' redirects an unconfirmed self vote instead).
- Whether the CI ticket for PR-triggered eval is raised now or after the drift PR.
- Whether #135 waits behind the drift PR or ships first with its eval noise acknowledged.

## UNVERIFIED list
- m3 "Keaton answered from 0.45-0.62 lesson" on main (not run).
- Per-PR manual dispatch history (no gh query).
- deploy job dependency on `checks` (not read in full).
- Whether 30 broken chunks are served on main today.
- Whether the "2026-10-25 precedent" has a standalone log entry (cited at EVIDENCE_LOG:123, not located as its own section).

## 6-line summary
1. Keaton self-answer bug: real historically, fixed on main by 4977a33 (#34, 2026-09-24); router.ts:267-273 has no bare-vote branch. Remaining 0.45-0.62 lesson-answer path is UNVERIFIED.
2. C1' is not the #34 code (returns redirect, never self), but it reverses #34's documented fall-through. Conflict needs a comment rewrite and a ben-history sentence.
3. PR sequencing precedent: one PR per measured change (#127-#131), eval compared against same-environment pristine-main baseline; REPORT.md regenerated on main only (f5161ca).
4. CI: no PR workflow runs npm test or eval:ben. eval:ben only runs in deploy.yml:38 on push to main; codeql.yml:9 is the only pull_request trigger.
5. Holdout is contaminated (evals/ben/holdout.json last changed in ebd7f6d, #33); a holdout ticket is required before merge.
6. Verdict APPROVE WITH CONDITIONS (5 testable conditions in the seat file); Chair decides the #34 reversal and CI-ticket timing.
