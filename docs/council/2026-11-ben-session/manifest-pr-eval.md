CONSENSUS MANIFEST (draft, for Skeptic review) — ticket #136 part 1

Task: Run Ben's routing gate (`eval:ben`) on pull requests that touch Ben files, and make `npm run eval:ben` work on Windows. Today `eval:ben` runs only on push to main (.github/workflows/deploy.yml, job "Frontend gates"), so a routing regression is found after merge. The script `vitest run --config vitest.eval.config.ts; status=$?; cat evals/ben/REPORT.md; exit $status` also fails under cmd.exe (it cannot parse `;`/`$?`).

Risk tier and rationale: T2. New CI workflow plus a package.json script change. No T1 path (no worker/, session.ts, gist-sync.ts, AuthBar.tsx). No secrets used. Chair + Skeptic review before code.

Design (smallest that works):
1. New `.github/workflows/pr-ben-eval.yml`, trigger `pull_request` (not `pull_request_target`), `permissions: contents: read`, paths filter: `src/ai/local/**`, `scripts/ben/**`, `evals/ben/**`, `content/lessons/**`, `vitest.eval.config.ts`, `package.json`, `package-lock.json`, `.github/workflows/pr-ben-eval.yml`. One job: checkout, setup-node 22 with npm cache, `npm ci`, `npm run ben:index`, `npm run eval:ben`. Same SHA-pinned actions as deploy.yml. `concurrency` group per PR with cancel-in-progress.
2. New `scripts/ben/run-eval.mjs` (about 10 lines): spawn `vitest run --config vitest.eval.config.ts`, then print `evals/ben/REPORT.md`, exit with vitest's status. `package.json` `eval:ben` becomes `node scripts/ben/run-eval.mjs`.
3. Do NOT change the repo ruleset. After the workflow has run green once, Liz decides whether to add it as a required status check (settings change, Chair-only).

Scenarios / acceptance:
- A PR that touches a Ben path starts the job; a red gate fails the job; a PR touching only docs/ or unrelated paths does not start it.
- `npm run eval:ben` works on Windows and Linux with the same exit code semantics (non-zero when a gate fails; REPORT.md printed either way).
- The PR that adds the workflow triggers it (its own path is in the filter), which is the live proof.
- deploy.yml unchanged (eval stays after-merge as a second line of defense).

Failing tests / contracts (AMENDED after Skeptic + advisor): the implementer first reproduces the current Windows failure of `npm run eval:ben` and quotes the exact error (failing-first evidence). After the wrapper: the same command passes on Windows; one deliberately failing run (temporary local edit, not committed) shows a non-zero exit AND REPORT.md still printed; both recorded in EVIDENCE_LOG.md. The workflow going green on its own PR is NOT counted as failing-first proof.

AMENDMENTS (Skeptic APPROVE WITH CONDITIONS, 8 conditions; advisor reviewed):
A1 Advisory first: the job runs with `continue-on-error: true` and writes REPORT.md to the step summary. It becomes blocking only after #136 part 2 (BATCH=1) fixes the BATCH=32 noise, or after 10 clean PR runs. Until then it is visibility, not protection.
A2 Workflow hardening: `timeout-minutes: 15`, `persist-credentials: false`, per-PR concurrency group (not deploy's `pages` group), `permissions: contents: read`.
A3 Paths filter from the real import chain (evals/ben/routing.eval.ts -> scripts/ben/{build-index,embedder,chunk-lessons}.mjs -> scripts/seo/lesson-meta.mjs; -> src/ai/local/{agent,cards,retrieve,types,web}.ts and src/ai/local/semantic/*): `src/ai/local/**`, `scripts/ben/**`, `scripts/seo/lesson-meta.mjs`, `evals/ben/**`, `content/lessons/**`, `vitest.eval.config.ts`, `package.json`, `package-lock.json`, `.github/workflows/pr-ben-eval.yml`. Implementer must grep the imports of retrieve.ts, web.ts, cards.ts, types.ts to confirm nothing outside src/ai/local is pulled in (UNVERIFIED so far).
A4 Wrapper: spawn `process.execPath` on vitest's JS entry (not `npx`, which needs a shell on Windows), `stdio: 'inherit'`, print REPORT.md in try/catch, exit `status ?? 1`.
A5 Required-check trap (Chair-only, deferred): a path-filtered workflow that does not fire stays Pending and blocks unrelated PRs. Before it can be a required check, drop `paths:` and add an always-reporting diff-based job. Do not add it to the ruleset until then.
A6 Model download comes from a mutable HF `resolve/main` ref (hash-pinned): an upstream outage turns PRs red for unrelated reasons; another reason for advisory-first.

Scoped files (3 + record): `.github/workflows/pr-ben-eval.yml`, `scripts/ben/run-eval.mjs`, `package.json`; record: `EVIDENCE_LOG.md`.

Risks / unknowns: eval downloads a 23 MB model from Hugging Face on every PR run (SHA-256 pinned by ben:index); no cache proposed (YAGNI, add actions/cache if run time hurts); fork PRs get read-only token, fine; job time about a few minutes (UNVERIFIED, deploy.yml gives no timing); required-check status is a ruleset decision; this does not fix `BATCH=32` noise, so a PR's gate result can still flip from chunk-count changes (that is ticket #136 part 2).

Rejected alternatives: run all gates (lint/test/build/e2e) on every PR (bigger scope, separate ticket; agents for #125/#109 noted PRs have no test CI at all, flag to Chair); `pull_request_target` (unsafe); cross-env/npm-run-all dependency (new dependency for 10 lines); editing the ruleset from this task.

Token budget: 12,000 for implementation (cheap-model rule: Haiku/Sonnet only). Approvals: BLANK (Skeptic + Chair). Chair decision: BLANK.
