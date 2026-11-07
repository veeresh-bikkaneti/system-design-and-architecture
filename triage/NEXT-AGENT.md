Handoff 2026-11-07T09:19Z | origin/main a11c799 | open PRs #135 #199 #200 #201 #202 #203 #204 #205 #206 #207 #208 #209 #210 #211 (verified with `gh pr list`; compare `git rev-parse origin/main`, a mismatch means re-verify)

# Next-agent handoff — Ben local-first work

Read this file, then `AGENTS.md` and `docs/agent-notes.md`. Before acting, run `git fetch origin`, `gh pr list`, and inspect current PR heads and checks. The remote is the source of truth. Do not merge a PR without its required gates, current-head independent review, and Liz’s approval.

## Current repository state

`main` is `a11c799`. Main retains Ben’s browser-local inference and WebGPU fallback. The owner’s constraint remains: no cloud inference, paid API, or Oracle VM.

| PR | Verified state | Next action |
|---|---|---|
| #199 | Draft, head `62a8fb0`; current report is 201 diagnosis + 0 fresh cases, accuracy 89.6%, drift 2.9%, top-3 97.0%. Three D2b hygiene contracts fail. `holdout.json` still contains 103 examined “Blind holdout 2” cases; these are not fresh and are excluded from the report. | Separate T2 plan/review is being prepared. Skeptic C voted APPROVE WITH CONDITIONS: move the 103 examined cases into diagnosis before authoring a new holdout; make one-shot scoring exact; mechanically isolate the fresh author; retain unchanged gates. Formal Advisor and Chair approval are pending. No implementation authorized. |
| #135 | Open, non-draft, head `9fdc878`; merge base `f739912`, behind current main `a11c799`. All 7 checks are green on the stale head; its index build uses BATCH=32, while current main pins BATCH=1. | Separate T2 revalidation plan/review is being prepared. Skeptic C voted APPROVE WITH CONDITIONS: merge current main normally without force-push, preserve BATCH=1, remeasure both CPU variants, and do not claim merge readiness from the historical 48-case holdout. A distinct fresh set is required for any merge claim. Formal Advisor and Chair approval are pending. No implementation authorized. |
| #211 | Draft, docs-only browser-AI note and T3 manifest, head `3daf767`; primary sources checked 2026-11-06. | Owner review. No runtime integration or cross-browser runtime test is claimed. |
| #200 | This rolling handoff PR, draft. | Update this same branch/PR at every checkpoint; do not open another handoff PR. |
| #201 | Draft, pinned-vector artifact phase 1. | Keep separate from #135 and #199. |
| #202–#210 | Open dependency-update PRs. | Recheck only if relevant. |

## Decisions and evidence

- Approved setup policy: explicit Ben/tutor setup wording routes to `tutor-loop` only when no distinct own-environment signal is present; own-environment cues, bare “AI env” ambiguity, and the exact screenshot phrasing clarify.
- PR #199’s 83.3% figure is **not current**. That number belongs to a separate earlier candidate with 165 diagnosis + 48 holdout cases and a different index. Do not present it as either current PR’s result.
- The current PR #199 report has zero fresh holdout cases. Its 103-case `Blind holdout 2` is examined and cannot be presented as fresh. The fresh set must be authored only after the candidate is frozen, by an independent author given only `content/lessons/`, and scored once per required variant without tuning.
- PR #135’s old zero-fragment and routing figures were measured on an older base and BATCH=32. They are not acceptance evidence for current main, where BATCH=1. Keep #135 separate from #199 and #201; no force-push or merge is authorized.
- Two independent Skeptic reviews are complete, both APPROVE WITH CONDITIONS. The formal Advisor (Opus) is not available through the configured session tools; the plans must remain PROPOSED. Do not implement or approve them yourself. Next: publish each as a separate plan-only draft PR with the full Skeptic reports; then update this handoff with the new PR numbers and exact status.
- The browser note distinguishes site-callable APIs from browser UI features: Chrome’s desktop Prompt API is listed as shipping at Chrome 148 with model/hardware gates; Edge’s Prompt API is an experimental Canary/Dev API; the reviewed Mozilla pages describe selected Firefox on-device features but do not document a general website-callable Prompt API. Ben’s retrieval, citations, confidence, guardrails, and tool orchestration remain application responsibilities.

## Next-agent prompt

> Continue Ben’s local-first work from current `origin/main`. First reread `AGENTS.md` and verify main and open PRs. Do not merge. Keep #199’s three data-hygiene failures, the 103 examined cases still labeled “Blind holdout 2,” and the zero-fresh-holdout report visible; do not reuse the historical 83.3% figure. Keep #135’s BATCH=32 report distinct from current BATCH=1 main. Two independent Skeptic reviews approve the proposed separate T2 plans with conditions; the formal Advisor is unavailable, so plans remain PROPOSED and no implementation is authorized. Preserve browser-local inference, the WebGPU fallback, and the no-cloud/no-VM decision. Update this same handoff PR after the next checkpoint.
