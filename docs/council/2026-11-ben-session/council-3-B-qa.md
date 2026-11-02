# Council 3, seat B (QA): Q2, Q4, Q5, test contracts

**Verdict: APPROVE WITH CONDITIONS** (joint direction). Read-only; only vitest run was in m3.

## Verified
- m3 `npx vitest run src/ai/local/semantic`: 30/30 pass (run by me, 192 ms). Full `npm test`, lint, content:*, build, e2e: NOT RUN.
- Red-first tests are m3 `semantic.test.ts:222-228` (Keaton, expects not lesson) and `:238-243` (split tech, not parametric). drift-measure-2.md section 1 says both FAIL on main. I did not re-run on main (read-only). Uncommitted in m3, so no commit records the red state: UNVERIFIED that it reproduces.
- Pin tests `semantic.test.ts:211-220` are green on main (drift-measure-2 section 1, 27/27 on main). They are regression guards, not red-first. The only red evidence for the pin path is draft C1 (3 failed), which lives in a report only.
- Correction to the brief: the m3 pin tests are NOT blind to the self path. `:216` asserts `intent === 'self'`, so the vote is checked. Competing index (`:214`) has one designing-ai-systems chunk; the pin is name-based, so the pass comes from the tag, not the vector.
- Weak assertion: `:242` `not.toBe('parametric_fallback')` passes for any other action, including a regression to `clarify`. Tighten to the action the policy should give (`redirect` or `clarify`): UNVERIFIED which one Liz wants.
- `evals/ben/data.test.ts:56-61` checks exact normalised text only, so near-duplicates of scored questions pass.

## Q2 (pin tests)
Put the two red tests (`:222`, `:238`) and the three pin guards (`:211`) in the drift PR, not #134. The guards exercise the C1' ordering, which is the drift PR's change. #134 keeps its own `isTutorSetupQuestion`/`namedTagLessons` tests untouched. No tiny PR first: nothing changes behaviour without the drift PR. Commit order per AGENTS section 2: test commit (shown failing on main), then fix commit.

## Q4 (eval protection)
- Verified: `.github/workflows/deploy.yml:7-9` triggers only on `push: main` and `workflow_dispatch`. `:37-38` run `ben:index` and `eval:ben`. Only `codeql.yml` runs on `pull_request`.
- So a router change passes PR checks and the gate fails after merge, at deploy. Committed `REPORT.md` is not checked against a fresh run (no check found).
- Ticket, not scope: PR-triggered job running `npm run ben:index && npm run eval:ben`, path-filtered to `src/ai/local/**`, `scripts/ben/**`, `evals/ben/**`, `content/lessons/**`.

## Q5 (blind holdout)
- ADR section 7 trigger is met: C1'/C2 were designed against `h-d-ai-art` and `h-trap-gateway-arch` (drift-measure-2 section 3). The holdout is contaminated for gating.
- Author may read: lesson titles and headings, the five intent names, the Ben chat as a student sees it.
- Author must not read: `src/ai/local/**`, `scripts/ben/**`, `evals/ben/*` (other than writing the new file), `REPORT.md`, `_scratch/**`, Ben entries in `EVIDENCE_LOG.md`, `docs/ben-history.md`, ADR sections 4-5 (thresholds).
- Author labels intent and lesson slug only. A second person maps intent to action. Author never runs the router or embedder.
- Freeze: commit the file and record its SHA-256 in `EVIDENCE_LOG.md` before the router diff under test runs.
- Attestation line in the PR: "Author: __, session: __. Wrote N cases without reading the list above; ran no router; file SHA-256 __, committed before the router diff." Self-report only: UNVERIFIED without a transcript.
- Size: current holdout has 20 off-course cases (drift-measure-2 section 3). Rule of three: 0 misses in n gives a 95% upper bound of about 3/n, so certifying drift at or below 3% needs n of at least 100 off-course cases with zero misses (inference, not measured).
- Second labeler on a 20% sample; report agreement.

What an agent-written holdout cannot prove: independence from the model that wrote the router (shared blind spots); that phrasings match real students; that it did not infer thresholds from public docs or git history (attestation only). What a Liz-written set adds: no shared model blind spot, and her real cases (the Catholic-schools question, ADR section 1). It still cannot prove representativeness. Recommend both: Liz writes a set from real student phrasings, the agent set is a second check.

## Test contracts and gates (drift PR)
1. `:222` and `:238` fail on main with the reason in drift-measure-2 section 1; pass with the patch.
2. `:211` (3 phrasings) and `:245` stay green.
3. `npm run ben:index && npm run eval:ben` on the rebased head: 7/7, 0 skipped, drift <= 3% (2/69). Paste REPORT.md. Measured so far on Windows only: UNVERIFIED on Linux.
4. NOT RUN: `npm test`, `npm run lint`, `content:check`, `content:validate`, `build` with `VITE_BASE_PATH`, `test:e2e`.
5. Ship no `BATCH` env default, DIAG dump, `router_main.ts`, `probe.eval.ts`, or 900 s timeout (drift-review-c2 R8).

## Q6 (missed, Chair-only)
- Chair: order #134 first; accept Windows-only evidence or require Linux; approve the techMajority 0.5 rationale; decide who writes the holdout; approve the file-cap exception (4th and 5th file); accept merging with a contaminated holdout.
- Observation: `git rev-parse --abbrev-ref HEAD` in the repo returns `feat/contact-feedback`, not `fix/ben-index-batch-1` as the gitStatus snapshot says. `66a3ef0` exists in history. Confirm the branch before any PR.
- `vitest.eval.config.ts` (m3 diff) and `routing.eval.ts` run only under `eval:ben`, not `npm test` (vitest.config.ts excludes only worker, dist, e2e). So `data.test.ts` runs in `npm test`; the gates do not.
