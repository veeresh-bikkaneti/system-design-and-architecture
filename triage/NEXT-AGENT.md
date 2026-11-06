Handoff 2026-11-06T07:17Z | origin/main a11c799 | open PRs #135 #199 #200 #201 #202 #203 #204 #205 #206 #207 #208 #209 #210 #211 (verified with `gh pr list`; compare `git rev-parse origin/main`, a mismatch means re-verify)

# Next-agent handoff — Ben local-first work

Read this file, then `AGENTS.md` and `docs/agent-notes.md`. Before acting, run `git fetch origin`, `gh pr list`, and inspect current PR heads and checks. The remote is the source of truth. Do not merge a PR without its required gates, current-head independent review, and Liz’s approval.

## Current repository state

`main` is `a11c799`. Main retains Ben’s browser-local inference and WebGPU fallback. The owner’s constraint remains: no cloud inference, paid API, or Oracle VM.

| PR | Verified state | Next action |
|---|---|---|
| #199 | Draft, head `62a8fb0`; T2 reconciliation manifest and Advisor approval are recorded on the PR. | Do not merge. The 201-case diagnosis result is 89.6% accuracy, 2.9% drift, 5.8% offered, 2.0% refusal, and 97.0% top-3. The fresh-holdout count is 0. Serial tests are 750/753; three D2b hygiene contracts still fail in `evals/ben/data.test.ts`. Get a current, approved T2 plan/review for any further code change, then clear the applicable gates before writing/scoring a new holdout. |
| #135 | Open, non-draft, head `9fdc878`; review required. It changes the chunker and index builder. Merge base `f739912` is behind current main. | The sentence-aware chunker fix is already on this PR. Revalidate/rebase it against current main under an approved scope; rerun required content, index/eval, unit, build, and E2E checks before considering merge. |
| #211 | Draft, docs-only browser-AI note and T3 manifest, head `3daf767`; primary sources checked 2026-11-06. | Owner review. No runtime integration or cross-browser runtime test is claimed. |
| #200 | This rolling handoff PR, draft. | Update this same branch/PR at every checkpoint; do not open another handoff PR. |
| #201 | Draft, pinned-vector artifact phase 1. | Keep separate from #135 and #199. |
| #202–#210 | Open dependency-update PRs. | Recheck only if relevant. |

## Decisions and evidence

- Approved setup policy: explicit Ben/tutor setup wording routes to `tutor-loop` only when no distinct own-environment signal is present; own-environment cues, bare “AI env” ambiguity, and the exact screenshot phrasing clarify.
- PR #199’s 83.3% figure is **not current**. That number belongs to a separate earlier candidate with 165 diagnosis + 48 holdout cases and a different index. The current PR intentionally reports zero fresh holdout cases; do not present 83.3% as this candidate’s result.
- The three remaining D2b failures are near-copy exemplar hygiene, the “How do I” share cap, and the pattern/principle example count. Both CPU variants still need a fresh-set score after the candidate is frozen and the data-hygiene gate is green.
- The browser note distinguishes site-callable APIs from browser UI features: Chrome’s desktop Prompt API is listed as shipping at Chrome 148 with model/hardware gates; Edge’s Prompt API is an experimental Canary/Dev API; the reviewed Mozilla pages describe selected Firefox on-device features but do not document a general website-callable Prompt API. Ben’s retrieval, citations, confidence, guardrails, and tool orchestration remain application responsibilities.
- The prior implementation loop cap is exhausted. Further T2 code work requires a revised current-head plan and the specified Skeptic/Advisor approval. The separate docs-only PR #211 is authorized under its T3 manifest. No owner domain decision is outstanding; the owner retains per-PR merge approval.

## Next-agent prompt

> Continue Ben’s local-first work from current `origin/main`. First reread `AGENTS.md` and verify main and open PRs. Do not merge. Keep #199’s three data-hygiene failures and zero fresh-holdout status visible; do not reuse the historical 83.3% figure. Treat #135 as a separate chunker PR whose merge base is behind current main; revalidate it under a current approved plan. Keep #211 docs-only. Before further code changes, obtain the current-head manifest/reviews and respect the three-iteration limit. Preserve browser-local inference, the WebGPU fallback, and the no-cloud/no-VM decision. Update this same handoff PR after the next checkpoint.
