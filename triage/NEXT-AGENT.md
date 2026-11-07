Handoff 2026-11-07T09:23Z | origin/main a11c799 | open PRs #135 #199 #200 #201 #202 #203 #204 #205 #206 #207 #208 #209 #210 #211 #212 #213 (verified with `gh pr list`; compare `git rev-parse origin/main`, a mismatch means re-verify)

# Next-agent handoff — Ben local-first work

Read this file, then `AGENTS.md` and `docs/agent-notes.md`. Before acting, run `git fetch origin`, `gh pr list`, and inspect current PR heads and checks. The remote is the source of truth. Do not merge a PR without its required gates, current-head independent review, and Liz’s approval.

## Current repository state

`main` is `a11c799`. Main retains Ben’s browser-local inference and WebGPU fallback. The owner’s constraint remains: no cloud inference, paid API, or Oracle VM.

| PR | Verified state | Next action |
|---|---|---|
| #199 | Draft, head `62a8fb0`; report is 201 diagnosis + 0 fresh cases, accuracy 89.6%, drift 2.9%, top-3 97.0%. Three D2b hygiene contracts fail. `holdout.json` still has 103 examined “Blind holdout 2” cases; they are excluded as non-fresh. | Plan-only T2 draft is PR #212 (head `3bff716`). Skeptic C round 1: APPROVE WITH CONDITIONS. Plan requires moving the 103 examined cases into diagnosis before authoring a new set; D2-L and D2b remain gated. Formal Advisor/Chair approval and reviewer confirmation are pending. No implementation authorized. PR #199 links to #212. |
| #135 | Open, non-draft, head `9fdc878`; merge base `f739912`, behind current main `a11c799`. All 7 existing checks are green on that stale head; it uses BATCH=32 while main pins BATCH=1. | Plan-only T2 draft is PR #213 (head `b9ac0d4`). Skeptic C round 1: APPROVE WITH CONDITIONS. Plan is revalidation-only, requires a non-force merge of current main, preservation of BATCH=1, both index variants, and treats the 48-case set as historical/non-fresh. A #135-specific approved fresh set is required before any merge-readiness claim. Formal Advisor/Chair approval and reviewer confirmation are pending. No implementation authorized. PR #135 links to #213. |
| #212 | Open, draft, plan-only T2 record for #199; base `a11c799`; head `3bff716`. One check passed, four checks pending at last inspection. | Keep draft. Full Skeptic report is in the manifest; formal Advisor and Chair decisions are not recorded. |
| #213 | Open, draft, plan-only T2 record for #135; base `a11c799`; head `b9ac0d4`. One check passed, four checks pending at last inspection. | Keep draft. Full Skeptic report is in the manifest; formal Advisor and Chair decisions are not recorded. |
| #211 | Draft, docs-only browser-AI note and T3 manifest, head `3daf767`; primary sources checked 2026-11-06. | Owner review. No runtime integration or cross-browser runtime test is claimed. |
| #200 | This rolling handoff PR, draft. | Update this same branch/PR at every checkpoint; do not open another handoff PR. |
| #201 | Draft, pinned-vector artifact phase 1. | Keep separate from #135 and #199. |
| #202–#210 | Open dependency-update PRs. | Recheck only if relevant. |

## Decisions and evidence

- Approved setup policy: explicit Ben/tutor setup wording routes to `tutor-loop` only when no distinct own-environment signal is present; own-environment cues, bare “AI env” ambiguity, and the exact screenshot phrasing clarify.
- PR #199’s 83.3% figure is **not current**. That number belongs to an earlier candidate with 165 diagnosis + 48 holdout cases and a different index. Do not present it as either current PR’s result.
- The current #199 report has zero fresh cases. The 103-case “Blind holdout 2” set is examined and cannot be presented as fresh. PR #212 requires moving it into diagnosis, then freezing the candidate before a separate new blind set is authored and scored once per required variant.
- PR #135’s old zero-fragment and routing figures were measured on an older base and BATCH=32. They are not acceptance evidence for current main. Its historical 48-case set is not fresh; PR #213 is explicitly revalidation-only and blocks any merge-readiness claim without a distinct approved fresh set.
- Two independent Skeptic reports are recorded verbatim in PR #212 and #213. Both voted APPROVE WITH CONDITIONS. The configured session tools do not expose the formal Advisor (Opus); therefore both plans remain PROPOSED, with reviewer confirmation and Chair approval pending. No code changes or merges were made. Plan-document `git diff --check` passed; the new draft PR checks were pending at last inspection.
- The browser note distinguishes site-callable APIs from browser UI features: Chrome’s desktop Prompt API is listed as shipping at Chrome 148 with model/hardware gates; Edge’s Prompt API is an experimental Canary/Dev API; the reviewed Mozilla pages describe selected Firefox on-device features but do not document a general website-callable Prompt API. Ben’s retrieval, citations, confidence, guardrails, and tool orchestration remain application responsibilities.

## Next-agent prompt

> Continue Ben’s local-first work from current `origin/main`. First reread `AGENTS.md` and verify main and open PRs. Do not merge. Review the separate plan drafts #212 (PR #199 D2 follow-through) and #213 (PR #135 current-main revalidation). Keep #199’s three data-hygiene failures and the 103 examined “Blind holdout 2” cases visible; do not reuse the historical 83.3% figure. Keep #135’s BATCH=32 result distinct from BATCH=1 main and do not treat its 48-case set as fresh. Both Skeptics approved with conditions; formal Advisor concurrence and Chair approval are pending, so do not implement. Preserve browser-local inference, the WebGPU fallback, and the no-cloud/no-VM decision. Update this same handoff PR after the next checkpoint.
