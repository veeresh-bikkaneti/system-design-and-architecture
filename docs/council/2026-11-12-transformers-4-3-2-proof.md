# Council record: Branch 11 — Transformers 4.3.2 proof (F9 transformers slice)

Tier T2 (AGENTS.md §3). Branch `chore/transformers-4-3-2-proof`, base `origin/main` @ `a11c7997b63a31a96cdb4bb33a0d2de948647ab0` (verified: Phase 1 record, `pstack-interrogation-2026-11-12.md` header; Arena/Manifest header agrees).
Owning seat: B — source: Consensus Manifest, Part II, Branch 11 (verified, `pstack-arena-council-2026-11-12.md` §II.2 Branch 11).
Round count: 1 of 2 (AGENTS.md §3 step 7).
Model diversity: all seats ran on one model family this session — recorded as "no model diversity" per AGENTS.md §3 step 1 (source: Consensus Manifest §II.1, verified).
Implementing agent: builder seat (model name withheld per commission instruction).

## Consensus Manifest summary (Branch 11)

Source for every line below: Consensus Manifest §II.2 Branch 11 (verified) and Phase 1 evidence §1 F9 / §3 / §7 (verified).

- Scope in: `@huggingface/transformers` 4.3.0 → 4.3.2 on its own branch. The intended code diff is `package.json` + `package-lock.json` ONLY. Never bundled with a web-llm bump — separate fragility (Seat C).
- Why the proof is the item (Seats A/C): the blast radius is total — build-time index, eval, browser runtime — while the proof costs minutes. Phase 1 §1 F9 (verified): the transformers bump is the riskiest pending bump for exactly this reason; the dependabot branch's lockfile was verified in Phase 1 to leave `onnxruntime-web` unchanged — this branch re-verifies that from its own lockfile diff, not from Phase 1.
- Proof package (all mandatory, in order): (1) baseline at HEAD first — clean `npm ci`; determinism tests (`scripts/ben/embedder.test.ts`, `scripts/ben/build-index.determinism.test.ts`, `src/ai/local/runtime.test.ts`); `npm run eval:ben` with REPORT numbers saved. HEAD baselines to compare against (Phase 1 §7, verified): combined accuracy 87.1% / drift 2.9% / offered 5.8% / top-3 97.1%; holdout-only accuracy 83.3% / drift 5.0% / offered 15.0%. The builder's own at-HEAD run in this worktree is the comparison of record (environment parity); both are reported. (2) Bump to 4.3.2, keeping the declared range style (HEAD declares the exact pin `"4.3.0"` in `package.json`, verified). (3) Clean `npm ci` again from the new lockfile (exit 0 required). (4) Determinism tests again — index vectors unchanged, or any change measured and explained (numbers, not adjectives). (5) `npm run eval:ben` after, same comparison (combined + holdout-only separately). (6) `public/ort/` asset check: the shipped WASM pair matches what the runtime requests; verify from the lockfile diff that `onnxruntime-web` is unchanged.
- Gates after the bump: `npm run lint`; `npm run build` with `VITE_BASE_PATH=/system-design-and-architecture/`; never commit generated `public/` artifacts.
- Stop conditions (binding): any gate-relevant metric movement reclassifies this from dep bump to routing change — STOP, do not wave it through; report the movement as the headline result. If the proof fails at 4.3.2, the bump is DROPPED: the version change is reverted and the deliverable becomes a proof-failure report (record doc + evidence only). Failing-first = N/A with reason recorded (no defect is claimed for 4.3.0).
- Honesty condition: `eval:ben` runs in Node and cannot prove the in-browser WASM load — the PR labels browser load UNVERIFIED unless a browser smoke check actually runs (Seat A).
- Scope fences: `worker/` is never touched (AGENTS.md §11 T1 paths); never merge; never push to main.

## Advisor verdict for this branch — VERBATIM

Source: advisor report `advisor-agree-2026-11-12.md` §6 (Branch 11), pasted verbatim below, including its heading verdict line unchanged.

> **Verdict: AGREE**

**Verdict: AGREE**

**Faithfulness to evidence:** Verified. `@huggingface/transformers` 4.3.0 → 4.3.2 is the riskiest pending bump precisely because its blast radius is total — build-time index, eval, browser runtime — while its branch lockfile leaves `onnxruntime-web` unchanged (Interrogation §1 F9; §3 Consider, transformers slice — verified). The branch is correctly framed as "the proof is the item" and correctly kept off any web-llm bump (separate fragility — Seat C, Arena/Manifest §II.2 branch 11 — verified).

**Tests / acceptance:** Verified sufficient and measurable — clean `npm ci`; the three determinism suites (`embedder.test.ts`, `build-index.determinism.test.ts`, `runtime.test.ts`) with index vectors unchanged or any change measured and explained; `eval:ben` before/after against the HEAD baseline (combined 87.1% / 2.9% / 5.8% / top-3 97.1%, holdout-only separately — figures verified at Interrogation §7) required on risk grounds despite no `src/ai/local/` diff; `public/ort/` asset check with the `onnxruntime-web` pin verified in the diff itself; any gate-relevant metric movement reclassifies the branch from dep bump to routing change and stops it for F2-grade scrutiny; a failed proof drops the bump rather than forcing it (all verified, Arena/Manifest §II.2 branch 11).

**Notes:** None. [No NON-MATERIAL notes are needed: the two operational facts a builder needs are already in the record — the proof runs are heavy and belong on home disk, not the 512 MB `/tmp` tmpfs (Interrogation, premise correction 3 — verified), and the PR must label the in-browser WASM load UNVERIFIED unless a browser smoke check actually runs, because `eval:ben` in Node cannot prove it (Seat A honesty condition, branch 11 text — verified). Both are restated here as builder conditions, not as notes on the verdict.]

**Conditions a builder must honour:** proof package complete or the branch does not proceed; no bundling with a web-llm bump; metric movement = stop and reclassify, never wave through as noise; UNVERIFIED labelling of the browser leg as above.

---

## Disposition

The advisor verdict is `AGREE` with no notes (verified, advisor §6 above), so implementation proceeds under AGENTS.md §3 step 4 once this record is pushed to the remote (AGENTS.md §3 step 7: a record that exists only on one machine does not count).
