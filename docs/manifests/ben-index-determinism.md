# CONSENSUS MANIFEST: Ben index determinism (issue #180)

Status: DRAFT, awaiting Skeptic + advisor approval. Phase 1 only (reproduction, manifest, failing tests). No fix code. This is step 2 of the approved decision in `docs/council/2026-11-02-eval-tradeoff.md`. It is a program of three manifests (D1, D2, D3), each approved separately.

**Task:** make every chunk's vector in `public/ben/index.json` a pure function of that chunk's own text, so a content edit can no longer move unrelated vectors and flip threshold-edge eval cases (issue #180, QA R-28).

**Risk tier and rationale:** T2 (build pipeline behaviour change that moves eval scores; no public API). No T1 path touched (`worker/`, `session.ts`, `gist-sync.ts`, `AuthBar.tsx` out of scope). D2 touches `src/ai/local/`, so it needs `npm run eval:ben` after reading ADR 0001 (read). `GATES` and `maxDrift` are never edited.

## Reproduction (VERIFIED, run 2026-11-02 in this worktree, real pinned q8 model, 781 current chunks)
Same chunk embedded alone vs inside a batch (first 64 chunks, `scripts/ben/embedder.mjs` pipeline):

| batch size | max abs diff vs alone | min cosine vs alone |
|---|---|---|
| 2 | 0.02362 | 0.99058 |
| 8 | 0.02683 | 0.98495 |
| 32 (today) | 0.03716 | 0.97971 |

- `[text, text]` in one batch: max abs diff 0 between the two rows AND vs alone. Embedding the same text alone twice: 0. So repeat runs are byte-identical and duplicates match; the effect is neighbour-dependent, not noise. Consistent with the held branch's finding (24 DynamicQuantizeLinear nodes, one activation scale per tensor).
- Mechanism: INFERRED (medium confidence), not isolated by me. The held branch's commit message reports an unpadded row also moved, which argues against padding/attention masks and for per-tensor activation quantization. I did not dump the ONNX graph.
- Length-sorted batches of 32 do NOT fix it: removing one chunk from a length-sorted set still moved 172 of 780 other vectors (VERIFIED). Batches are still composed of neighbours.
- Timing, this laptop (Windows, Node, CPU), full index chunks only: batch 32 = 7.8 s; length-sorted 32 = 5.3 s; batch 1 = 6.9 s. BATCH=1 is not slower in practice (padding waste goes away).

## Options
- **A. BATCH=1** (the held experiment). Row r depends on text r only. Cost: nothing measurable (above). Matches the browser's one-query path. Does not by itself prove cross-OS equality.
- **B. Length-sorted fixed batches.** REJECTED: still cross-batch dependent (172/780 moved when one chunk was removed).
- **C. Content-addressed cache** (key = hash of embedded text + model pin). Gives bit-identical vectors forever, even across machines, but adds a committed or CI-cached artifact, an invalidation story, and a second source of truth. Over-built if A already holds on Linux.

**Recommendation: A**, with C kept as the documented fallback only if the Linux CI run does not match the local run (cross-OS float determinism of onnxruntime-node q8 is UNVERIFIED, low confidence). Build time inside CI budget: the advisory job has `timeout-minutes: 15`; index build is seconds (VERIFIED locally, CI timing UNVERIFIED until the PR's CI run).

## Scenarios / acceptance conditions
D1 (index):
1. Two builds of the same content are byte-identical.
2. Adding a chunk leaves every other chunk and intent vector bit-identical.
3. The same chunk gives the same vector alone and in a crowd. Tests skip with a printed reason when the model is absent.
4. Linux CI `npm run ben:index` output hash equals the local one for the same commit (compare `content` plus a hash of `chunkVectors`; UNVERIFIED until run).
5. Build time stays well inside the 15 min job budget (report the CI number).

D2 (router, council-4 conditions; only if the BATCH=1 eval fails a gate, as the held branch did at 4.3% drift vs 3.0%):
6. Unit test: "help me set up the tutor" reaches the tutor-loop lesson even when the vote is `off_topic`.
7. Unit test for `techMajority` (UNVERIFIED: the name does not exist on `origin/main`; `grep` over `src/` and `evals/` finds none, so D2 must say where it lives).
8. Consumed holdout recorded in ADR 0001 section 7; a new blind holdout ticketed.
9. "Who was Alan Turing" becoming redirect accepted as a regression in the PR body.
10. All 7 gate tests in `evals/ben/routing.eval.ts` run, none skipped; `maxDrift` unchanged (0.03).

D3 (holdout): see below.

## Failing tests (VERIFIED red at this commit)
`scripts/ben/build-index.determinism.test.ts` (new, 3 tests, mocks only the chunk list, calls the real `buildIndex()` with the real model):
- two builds byte-identical: PASSES today (guard, must stay green).
- adding a chunk leaves others bit-identical: RED, `40 of 40 unchanged chunks got a different vector: expected 40 to be +0`.
- same chunk alone or in a crowd: RED, scale/bytes differ (`0.00134413|...` vs `0.001331194|...`).
Red for the intended reason (batch composition), not an import error. No export change was needed, so D1 needs no API change.

## Scoped files and split
| Manifest | Scope | Source files (max 3) | Tests |
|---|---|---|---|
| **D1** deterministic index | `BATCH = 1` plus the explaining comment | `scripts/ben/build-index.mjs` (1) | `scripts/ben/build-index.determinism.test.ts` (this PR) |
| **D2** router conditions (only if the eval needs them) | tutor-setup routing before the off-topic redirect, `techMajority`, ADR 0001 section 7 | `src/ai/local/<router file>` (1-2, TBD), `docs/adr/0001-ben-semantic-routing.md` (1) | new unit tests, written first in D2 phase 1 |
| **D3** holdout | fold `holdout.json` into `cases.json`; new blind holdout; no router code | `evals/ben/cases.json`, `evals/ben/holdout.json` (2) | the existing eval |

Order: D1, then re-run the eval; if a gate fails, D2; D3 after the determinism fix. New eval cases go to `cases.json`, never `holdout.json`, except the freshly authored blind set which becomes the new `holdout.json` only after D1.

## Blind-holdout process (D3, as the advisor required)
- A FRESH agent (no inherited context) writes about 100 cases.
- Its brief names ONLY `content/lessons/` and explicitly forbids `evals/`, `REPORT.md`, router code (`src/ai/local/`), `scripts/ben/` and scratch files.
- The case file carries an attestation block listing the exact paths the agent was given. A reviewer checks the brief against that list, not the agent's claim.
- Folded in after D1 lands, so the numbers it produces are on the deterministic index.

## Risks / unknowns
- Cross-OS (Windows vs Linux) equality of q8 vectors: UNVERIFIED, low confidence. Fallback is option C.
- The held branch saw drift 4.3% at BATCH=1: a gate failure there is expected to surface again; D2/D3 exist for that. This PR does not touch thresholds.
- Mechanism (per-tensor quantization vs other) INFERRED.
- Model file was fetched from Hugging Face by the pinned-SHA path (verified by `ensureEmbedder`).

## Rejected alternatives
B (still batch dependent, measured). C as first choice (extra artifact, not needed unless Linux differs). Raising `maxDrift` (forbidden by the council).

## Token budget
15,000 for phase 1 (estimate unreliable; used roughly that order).

## Approvals / votes / dissent
None yet. Skeptic (C) and advisor review pending; Chair decides.

## Chair decision
Pending.

## Status update (council lead, 2026-11-03) - supersedes the DRAFT status and the UNVERIFIED lines above

- Status: D1 implemented and approved by council and advisor (record: `docs/council/2026-11-03-ben-index-determinism.md`). Independent review: verified with concerns, no blocking finding.
- Condition 4 result: the Windows and Linux `chunkVectors` hashes DIFFER (`f9feac54...` local, `1837cd2f...` Linux CI); the `content` hash is identical. This is recorded as expected float variation between platforms. Each platform is deterministic on its own (six determinism tests pass on Linux), and the eval outcome is identical on both (87.1 / 2.9 / 5.8 / 1.9). Option C is NOT adopted: a text-keyed cache cannot make two platforms agree. The Linux/CI build is authoritative for the gates; local eval numbers are indicative; the `BEN_INDEX_HASH` line in the CI log is the reference.
- Drift is 2.9% (2 of 69 off-course cases) against the 3.0% limit: zero slack. Independent measurement: the three newly missed cases moved by 0.02 or less across a decision line, or flipped one neighbour in a near-tie k-NN vote (boundary noise, inferred, not proven). Recorded risk: one more off-course flip turns the post-merge deploy red. Mitigation until D3 refreshes the measurement base: no content or router PR merges unless the advisory `PR Ben eval` summary is green on its exact head.
- Next: D3 (new blind holdout, written by a fresh agent in a throwaway worktree holding only a copy of `content/lessons/`), then re-measure #135. D2 (router change) is only built if D3 or a content edit shows a gate failing.
