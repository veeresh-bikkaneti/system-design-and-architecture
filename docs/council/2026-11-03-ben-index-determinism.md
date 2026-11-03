# Council record: Ben index determinism (PR #197, issue #180)

Tier T2. Procedure: AGENTS.md section 3 (Chair + Skeptic, then the advisor). Panel: one seat (Skeptic, sonnet). Council lead: Sonnet 5.5. Decided by council and advisor under the owner's standing instruction of 2026-11-02. This task executes step 2 of docs/council/2026-11-02-eval-tradeoff.md.

## Round 1

### Seat C (Skeptic), report, verbatim

VOTE: SUPPORT WITH CHANGES. A is the right fix, but the test must run in CI, and the merge order must be fixed first.

BLOCKING

1. The determinism test skips in CI, so it proves nothing there. Verified. The manifest's test uses describe.skipIf(!hasModel). Both pr-gates.yml (lines 46-50) and deploy.yml (lines 30-38) run npm run test before npm run ben:index. At that point the model is not on disk, so the three tests skip and only print a warning. Vitest's default include picks up scripts/ben/*.test.ts; vitest.config.ts has no include or exclude for it. Required change: add BEN_REQUIRE_MODEL=1, which turns the skip into a hard failure. Run the test as its own step after ben:index in pr-ben-eval.yml and deploy.yml. Add a fourth test: with the env var set and the model absent, the suite fails loudly. This adds a third workflow file, over the 3-file cap. The manifest must list .github/workflows/* as a justified exception or move the cap rule to a ticket. Amend it before code.

2. D1 alone may turn the deploy red, and the manifest does not say how to avoid it. Facts: eval:ben blocks only in deploy.yml, after the merge to main. pr-ben-eval.yml is continue-on-error, so it is advisory. The held branch measured drift at 4.3% against the 3.0% gate (commit 66a3ef0). Council-3 architect: "a split ships a red deploy gate" (council-3-A-architect.md:8). Merge protocol: D1 is not mergeable on its own unless its PR run shows all 7 gates green. The advisory job's summary is the evidence. If any gate fails on the D1 branch, ship D1 and D2 as one PR (two commits). Never edit maxDrift. D3 (the holdout) cannot rescue a red gate, because a new holdout only changes what is measured. Required manifest text: "D1 merges only with a green 7-gate run attached; otherwise D1+D2 merge together."

NON-BLOCKING

3. The tutor-setup condition is already on main. isDefiniteTutorSetup is at router.ts:183 and is applied at router.ts:327, before the redirect. Cases such as tutor-setup-1 (cases.json:145) and the tests at semantic.test.ts:269-289 already cover it. D2 needs this condition only as a regression check. techMajority does not exist in src/. It appears only in docs/council/2026-11-ben-session/c1p-c2.diff (line 33: if (vote.intent === 'tech' && vote.confidence > THRESHOLDS.techMajority), with techMajority: 0.5). It would be a new field in THRESHOLDS (router.ts:38) plus a branch near router.ts:352. For D1: only "no maxDrift change" and "all 7 gates run" apply. The rest is D2.

4. Cross-OS determinism is UNVERIFIED (low confidence). What I know: public/ben/ is gitignored (.gitignore:43), so there is no committed index. The artifact the gates measure is the Linux-CI-built one. What I did not check: whether embedder.mjs runs onnxruntime-node or the WASM build in Node; I did not read it fully. Failure mode: a vector that differs slightly on Linux would shift the eval at threshold edges, which shows up as a red deploy. Acceptance condition 4 is too soft. Require the PR's CI log to print the content hash and the chunkVectors hash, and require the same output from the local run. Acceptance should be a recorded Windows-vs-Linux hash comparison. Do not treat green gates alone as a match.

5. Cause claim. The mechanism is labelled INFERRED, which is honest. The wording "quantization, not padding" should say "consistent with" and nothing stronger, because the ONNX graph was not dumped. Alternative: indexing with an unquantized model would not match the browser's q8 query path. Reject it.

6. A vs C. Decision: A now, C only as a recorded fallback. Why C is not first: a cache would mask drift instead of removing it. It also adds a committed artifact with a model-pin invalidation story. The index is deliberately gitignored. A+C is over-built unless the Linux hashes differ.

7. Holdout leakage. The attestation lists paths, but a fresh agent with repo access can still read evals/. Control: create a throwaway directory (or git worktree) containing only a copy of content/lessons/, and run the agent with that as its sole working directory. The attestation records the directory listing (find . -type f | sha256). Split: the ~100 new cases are the new holdout.json, never tuned against. The old holdout.json folds into cases.json. The reviewer checks the brief and the listing, not the agent's claim.

8. Line endings. .gitattributes already sets eol=lf, so the content hash is safe. Windows runs will match only on a correct checkout; the hash comparison in item 4 would catch a CRLF slip.

9. Test quality (mutation check). The "two builds identical" test passes today, so it is only a guard. A wrong implementation such as a fixed batch of 2 with deterministic ordering would pass the "alone vs crowd" test only if the chunks happened to align. The "add one chunk" test would catch it for batch sizes greater than 1. Add an assertion that BATCH === 1 is not exported or relied on, or a test that inserts the new chunk at a middle position and not only at the front.

Cannot be verified before merge: Linux vector equality (item 4) and the CI build time (Linux 15 min budget); the 7-gate result on the BATCH=1 index. Who verifies after the merge: the owner-operator Chair, watching the post-merge deploy.yml run to completion, as the 2026-11-02 council record requires. T1 paths: none touched (verified from the manifest scope).

### Verdict (council lead, Sonnet 5.5), round 1

Adopt all nine.
- B1: BEN_REQUIRE_MODEL=1 turns the missing-model skip into a hard failure; the determinism test also runs as its own step after ben:index in pr-ben-eval.yml and deploy.yml; a fourth test proves the loud failure; the manifest lists .github/workflows/* as a justified exception to the 3-file cap (D1 files: build-index.mjs, the test, the two workflow files; listed explicitly).
- B2: merge protocol written into the manifest: D1 merges alone only with a green 7-gate run (advisory job summary) attached to the PR; otherwise D1 and D2 merge together as one PR (two commits) so main never has a red deploy gate; maxDrift is never changed; D3 cannot rescue a red gate.
- Decision A vs C: A (BATCH=1) now; C is a recorded fallback only if Linux hashes differ from local; A+C is rejected as over-built.
- Cross-OS: acceptance requires the CI log to print the content hash and the chunkVectors hash and a recorded Windows-vs-Linux comparison; green gates alone do not count as a match.
- Cause wording: "consistent with quantization", INFERRED; indexing with an unquantized model is rejected because it would not match the browser's q8 query path.
- D2: tutor-setup (isDefiniteTutorSetup, router.ts:183 and :327) is already on main and is a regression check only; techMajority does not exist in src/ and is a new THRESHOLDS field plus a branch near router.ts:352, designed in D2's own phase 1; ADR 0001 section 7 records the consumed holdout.
- D3: the holdout author is a fresh agent whose ONLY working directory is a throwaway copy of content/lessons/; the attestation records the directory listing hash; the new ~100 cases become the new holdout.json (never tuned against) and the old holdout.json folds into cases.json.
- Tests: add a middle-position insertion test and an assertion that no batch size other than 1 is relied on.
- Post-merge: whoever merges watches the deploy.yml run to completion (the Chair role stays with the owner; the check is run by the council lead).

Round count: 1 of 2. Sent to the advisor next; the reply is recorded in the following commit.

### Advisor (Opus), reply, round 1, verbatim summary

AGREE: adopt all nine. The Skeptic read the workflow files and found the silent CI skip, found isDefiniteTutorSetup already on main while techMajority exists only in a council diff, and confirmed public/ben/ is gitignored so the gates measure the Linux-built index. BATCH=1 over length-sorted batches is settled by the measurement (172 of 780 vectors still moved). One correction: the verdict's last line assigned the post-merge deploy watch ambiguously between the council lead and the Chair; the record must say one thing. The discriminating constraint for D1: does the advisory pr-ben-eval.yml job on the D1 branch build the index with BATCH=1 and run all 7 gates, and on which runtime path (onnxruntime-node or WASM)? If the advisory job does not build a fresh index, the merge protocol has no evidence source and D1+D2 must ship together. Two smaller notes: build-index.mjs must EMIT the content hash and chunkVectors hash (a code change in a scoped file, not only an acceptance condition); and the fourth test (env set, model absent, suite fails loudly) must actually run the failure path and cannot be satisfiable by a run where the model is present.

### Verified before launching D1 (council lead)

- .github/workflows/pr-ben-eval.yml runs on pull_request when the PR touches src/ai/local/**, scripts/ben/**, evals/ben/**, content/lessons/**, package.json and a few others. D1 touches scripts/ben/**, so the job runs. It does `npm ci`, `npm run ben:index` (the PR branch's own build-index.mjs, so BATCH=1), then `npm run eval:ben`, then publishes evals/ben/REPORT.md to the run summary. It is continue-on-error and has a 15 minute timeout. So the evidence source for the 7-gate result exists and is the Linux-built index.
- deploy.yml runs `npm run test` (line 34) before `npm run ben:index` (line 37) and `npm run eval:ben` (line 38), confirming the silent-skip finding.
- scripts/ben/embedder.mjs uses the onnxruntime-web WASM build inside Node (lines 72-117), the same runtime path on Windows and Linux. That makes cross-OS equality plausible but it stays UNVERIFIED until the recorded hash comparison.

### Outcome

Round count: 1 of 2. Advisor: AGREE. Decided by council and advisor under the owner's standing instruction of 2026-11-02. Correction applied: the council lead runs the post-merge deploy watch and attaches the result to the PR; the owner's merge word is unchanged. D1 scoped files (explicit exception to the 3-file cap, justified by finding B1): scripts/ben/build-index.mjs (BATCH=1, emit content hash and chunkVectors hash), scripts/ben/build-index.determinism.test.ts (BEN_REQUIRE_MODEL=1; the fourth test runs the suite in a subprocess with the env set and the model directory pointed at a missing path and asserts a non-zero exit, so the failure path really runs), .github/workflows/pr-ben-eval.yml and .github/workflows/deploy.yml (run the determinism test as its own step after ben:index with BEN_REQUIRE_MODEL=1).
