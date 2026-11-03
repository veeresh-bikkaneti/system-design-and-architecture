# CONSENSUS MANIFEST: Ben pinned vector artifact (issues #180, #198)

Status: DRAFT, awaiting Skeptic + advisor approval. Phase 1 only (manifest + failing tests). No fix code. Implements the decided FIX in `docs/council/2026-11-03-ben-blind-holdout.md` (round 1, outcome item 3), on `origin/feat/ben-blind-holdout-2`.

**Task:** stop `ben:index` from recomputing vectors on whatever CPU the runner has. Commit the vectors (`content/ben/vectors.json`); `build-index` reads them; `build-index --check` proves they still match the lessons.

**Risk tier and rationale:** T2. Build scripts and CI workflows, new committed artifact. No T1 path touched (`worker/`, `session.ts`, `gist-sync.ts`, `AuthBar.tsx` out of scope). No router, exemplar, threshold or `GATES` change. `src/ai/local/` is not edited, so `eval:ben` is a verification run, not a trigger.

## Facts (labelled)
- VERIFIED (earlier investigation, per the council record): `chunkVectors` hash is `f9feac54...` on slow runners and the Windows laptop, `1837cd2f...` on fast runners; the Pages artifact and the Cloudflare mirror of one commit got different bytes; ORT graph-optimization level changes bytes; forced WASM gives a third hash (`0c9a346f`, 3-10x slower). Routing ACTION changes between variant proxies: 0-2 of 304 cases; top-lesson slug changes: up to 16.
- INFERRED (low confidence): cause is native `onnxruntime-node` CPU-feature dispatch. Not proven; the fix does not depend on it.
- Browser queries are still embedded in the browser (WASM), which is numerically different from the pinned native index. This PR does not remove that gap. It removes build-to-build index differences only. Routing was tuned and evaluated against native-built vectors, so the browser/index mismatch is already priced into the eval numbers.
- Line endings: `.gitattributes` has `* text=auto eol=lf`, so checkouts are LF. The key also normalizes CRLF to LF so a stray CRLF copy cannot read as stale.

## Design (what phase 2 builds)
- Artifact `content/ben/vectors.json`: `{version, key, model, dims, chunkVectors:{data,scales}, intentVectors:{data,scales}}`. int8 plus per-row scale, same encoding as `index.json`. About 513 KB, 377 KB gzipped (earlier measurement; re-measure).
- Key = sha256 of `{chunks (LF-normalised), exemplars, EMBEDDER_FILES (model SHAs), EMBEDDER_VERSION}`, 16 hex. Today's `content` field minus the CRLF hazard plus a version constant. Bump `EMBEDDER_VERSION` when pooling, normalize, dtype, text template (`title. heading. text`) or `BATCH` semantics change.
- `build-index` (no flag): loads the pin, verifies key, writes gitignored `public/ben/index.json`. Never embeds. A stale pin is a hard error naming `npm run ben:pin`.
- `build-index --check`: recomputes key only. Needs no model, no network, CPU-independent. Exit 1 plus the exact command if missing, stale, or row counts disagree.
- `build-index --pin` (`npm run ben:pin`): embeds (BATCH=1), writes the artifact. Run by the lesson-edit author, committed in the same PR (main is ruleset-gated, no bot commits).
- `BEN_PINNED_PATH` env overrides the path (tests only). The Cloudflare mirror build (`WORKERS_CI=1`, built in a GitHub Actions job) runs the same `build-index`, reading the same file.
- **Designated pin environment: the GitHub Actions `ubuntu-24.04` job `ben-pin` (manual `workflow_dispatch`, uploads the artifact; author downloads and commits).** Why: it is the only environment every contributor can reach, with the same OS/Node/ORT as the deploy. Local `npm run ben:pin` is allowed as a fallback and is accepted only if the tolerance test passes against the pin of record. UNVERIFIED: which CPU class a given run lands on cannot be chosen, so the pin of record is ONE of the two known variants; the tolerance test, not the choice of machine, is the guarantee. The file records its provenance (os, cpu model, ort version) for the record.

## Scenarios / acceptance conditions
1. Lesson-edit PR with re-pin: `ben:check` green, `index.json` built from the pin, eval unchanged. Without re-pin: `ben:check` fails in `pr-gates.yml` with `npm run ben:pin`.
2. Fresh clone: `npm ci && npm run build` works with no model download for the index (the model files are still fetched for browser serving).
3. CI on a fast or slow runner: same `index.json` bytes (the pin), because nothing is recomputed.
4. Cloudflare mirror and Pages artifact of one commit: identical `index.json` bytes.
5. Stale artifact (any lesson or exemplar edit): `--check` exits 1; `build-index` throws.
6. Model SHA bump or `EMBEDDER_VERSION` bump: key changes, all builds fail until re-pinned.
7. Windows vs Linux checkout: same key (LF-normalised).
8. Two native builds on the SAME machine are byte-identical (existing determinism test). Cross-machine: content key equal, routing ACTIONS unchanged vs the pin on all eval cases, cosine and int8 tolerances CALIBRATED (see below).

## Failing tests (RED, shown 2026-11-03)
`scripts/ben/pinned-vectors.test.ts`, 17 tests, all fail for the intended reason (missing exports `contentKey`, `checkPinned`, `EMBEDDER_VERSION`; `content/ben/vectors.json` absent; `ben:pin`/`ben:check` scripts absent; workflows lack `npm run ben:check`). None needs the model. Covers: key stability and sensitivity (chunk text, exemplar text, model SHA, embedder version), CRLF invariance, fresh/stale/missing/row-count-mismatch checks naming `npm run ben:pin`, `buildIndex` returning pinned bytes without embedding, stale pin refused, committed artifact exists and is fresh and under 800 KB, CLI `--check` exits 1 with the fix and no model, scripts and workflow wiring.
Phase 2 also rewrites `build-index.determinism.test.ts` (model-gated): exact bytes only for two same-machine builds; content key equal; routing actions unchanged vs the pin on all eval cases.

## Tolerance calibration (proposal, UNVERIFIED numbers)
`cosine >= 0.999` and `1 LSB` were too tight on the proxies. Do not guess new ones. Phase 4: CI prints `BEN_INDEX_HASH` AND uploads its own freshly embedded `chunkVectors` as a workflow artifact (name includes runner CPU model from `lscpu`). Once one fast-runner and one slow-runner artifact exist, a one-off script measures min-cosine and max-LSB between each variant and the pin; set the thresholds at the observed worst case plus a stated margin (propose 2x the cosine gap, 2x the LSB), record the numbers in the ADR 0001 section 7. The routing-actions-unchanged assertion is the hard gate; cosine/LSB are the early-warning.

## Scoped files (max 3 per manifest; proposed split into four sequential manifests)
- **P1** `scripts/ben/build-index.mjs`, `scripts/ben/build-index.d.mts`, `scripts/ben/pinned-vectors.test.ts`: key, check, pin, read path.
- **P2** `package.json` (`ben:pin`, `ben:check`), `content/ben/vectors.json` (generated), `.gitattributes` (`content/ben/vectors.json -diff linguist-generated`, so a merge conflict is resolved by re-running `ben:pin`, not by hand).
- **P3** `.github/workflows/deploy.yml`, `pr-gates.yml`, `pr-ben-eval.yml`: add `npm run ben:check` (cheap, no model). `ben:index` already follows; the model is no longer needed for the index.
- **P4** `.github/workflows/ben-pin.yml` (new), `scripts/ben/build-index.determinism.test.ts` (tolerance rewrite), `docs/adr/0001-ben-semantic-routing.md` (note). Variant-vector upload goes in `ben-pin.yml`, not in deploy.
- Non-code, outside the cap: this manifest, council record, `EVIDENCE_LOG.md` entry. No exception needed for the cap itself.

## Failure modes and mitigations
- PR edits a lesson but forgets to re-pin: `ben:check` fails in `pr-gates.yml` and `deploy.yml` with the exact command.
- Merge conflict in generated JSON: `-diff` attribute; resolution is "take either side, re-run `npm run ben:pin`", then `ben:check`. Pin PRs are serial; conflicts are expected whenever two lesson PRs overlap.
- Artifact growth: about 0.66 KB per section; the 800 KB test ceiling flags it. UNVERIFIED: current chunk count growth rate.
- Line-ending drift: LF-normalised key plus existing `.gitattributes`.
- Model SHA bump: change `EMBEDDER_FILES`, key changes, `ben:check` fails, re-pin, commit. One PR.
- Author pins on a different CPU than the pin of record: tolerated by the routing-actions gate; `ben-pin` job is the reference.
- Pin recomputed on an author machine without the model: `--pin` fetches the SHA-pinned model like `ben:index` does today.
- Browser query vs native index mismatch persists (see Facts).

## Rejected alternatives
- WASM-only index build: third hash, 3-10x slower, and does not unify the Cloudflare mirror's hardware; not proven to be cross-runner stable.
- Hash-equality test on an arbitrary CPU: cannot choose the runner CPU; flaky by design.
- Recompute with fixed ORT options: graph optimization changes bytes, and the fast-runner cause is unproven.
- Bot commit of the pin: main is ruleset-gated.
- Coarser rounding only: lowers the flip rate, removes nothing.

## Risks / unknowns
- UNVERIFIED: the 513 KB / 377 KB size (re-measure at P2). UNVERIFIED: pin-of-record variant choice and its effect on the 307-case eval (run `eval:ben` on the pin at P2; compare with the 201-set numbers, drift slack is 0.1). UNVERIFIED: whether either variant fails the tolerance numbers until calibrated. The Windows laptop yields the `f9feac54` variant, so a local pin matches the slow-runner class.

## Token budget
15,000 for the whole program is too thin for four phases; Phase 1 spent about 10,000 (estimate, unreliable). Request: 15,000 per phase P1 to P4, Chair to confirm.

## Approvals / votes / dissent
Pending: Skeptic (C), advisor. None recorded.

## Chair decision
Pending.
