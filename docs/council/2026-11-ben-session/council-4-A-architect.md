# Council 4, seat A (Architect)

Verdict: option B (do not ship BATCH=1 yet; land the bigger holdout first, then ship V2 on that gate). APPROVE WITH CONDITIONS.

## 1. Which option protects routing integrity and the two pain points
- Evidence base: drift-measure-3.md tables (V0-V3); ADR 0001 s7 (holdout is the never-tuned guard; ADR notes a fix that raised diagnosis accuracy but dropped holdout 89.6 -> 85.4 was reverted as overfit).
- Architectural fact: BATCH=1 is a correctness fix (index must equal what the browser computes), not a tuning knob. V1/V2 are the browser-faithful numbers; V0's 1.4% drift is measured on an index users never run against. So the real current drift is likely ~2-3 cases, not 1 (inferred; cross-browser determinism UNVERIFIED).
- The problem is the instrument, not the router: 69 off-course cases at a 3.0% limit means 2 cases pass, 3 fail. One embedding wobble (h-d-ai-art moved .443 -> .456 from batching alone, +.006 over the .45 gate) flips green/red. A gate with a 1-case resolution cannot arbitrate a 1-case change.
- A (ship V2 now): meets the letter, zero slack. Holdout net -1 case (42 -> 41/48), overall -0.5 pt, new regression "help me setup the tutor" -> redirect (a course-integrity-adjacent miss: tutor setup is a core Ben question). It would also make every future lesson edit a coin flip for red on the drift gate. Pain point 2 (chatbot works as expected) is hurt visibly, pain point 1 (integrity) is "passing by luck".
- C (V3): restores 1/69 and holdout 87.5% but breaks env-own-openai and re-adds a rule the Chair dropped whose rationale is mostly gone (bare self branch already removed on main). It hides the fragile case rather than fixing it. Reject.
- B vs D: D-structural-fix for h-d-ai-art is tuning to one case on a burned holdout (ADR s7 overfitting warning). Reject as a ship path. D-lite is acceptable inside B: no router change, just eval-only visibility.
- Pick: B, because the safe order is (1) make the ruler finer, (2) apply the correctness fix, (3) read the ruler. Shipping the fix first inverts that.

## 2. Interactions
- #137 (advisory PR eval, merged): advisory means a red drift on a BATCH=1 PR will not block, which hides exactly the zero-slack risk. Do not rely on it as the safety net for this change; run `npm run eval:ben` locally and paste the numbers in the PR.
- #139 (WebGPU gate, no routing change): independent files, zero routing interaction. Can merge before or after; it must not be bundled (it would muddy a bisect of any routing regression).
- #135 (chunker, deferred): chunk boundaries change which text is embedded and what shares a batch. At BATCH=32 its effect is entangled with batch luck; at BATCH=1 it is a clean, deterministic effect. So #135 must be re-measured after BATCH=1 lands, and must not land before (its V0 numbers would be on a fiction). Keep it deferred behind BATCH=1.
- #136 (measuring ticket): part 3 (bigger blind holdout) is the prerequisite for BATCH=1. Parts 1-2, if cheap, can be an eval-only BATCH=1 mode so the advisory report shows browser-faithful numbers immediately (UNVERIFIED that the eval harness supports a flag without edits to GATES; m4 did it by sed on the constant).

## 3. PR boundary and merge order
1. PR-1 (#136 part 3): new blind holdout cases only (data files under evals/ben/); no router/index change. Baseline measured on current main BATCH=32 and BATCH=1 both, recorded in the PR. Must be written blind to V0/V1/V2 outputs.
2. PR-2: BATCH=32 -> 1 plus C2 (techMajority 0.5, one branch in router.ts) plus a unit test covering techMajority (none exists today; drift-measure-3 line "No test covers techMajority"). Index build time rises (UNVERIFIED how much; embed-per-text vs per-batch). Router (src/ai/local/) change, so `eval:ben` required per AGENTS.md s11 and ADR read. Two logical changes but both needed to pass gates (V1 alone fails); keep as one PR, two commits.
3. PR-3: #135 chunker re-measured at BATCH=1, only if it still pays.
- #139 anywhere, separate PR. Tier: T2 (new behavior, routing module; not on the T1 path list).
- Files for PR-2: index build script (BATCH const), src/ai/local/semantic router.ts, one test file = 3, inside the manifest limit.

## Conditions (testable)
1. PR-1 merges first: >= 150 new off-course blind cases (current 69 off-course gives 1.4 pt per case; target <= 0.7 pt per case), none seen during C2/BATCH tuning. UNVERIFIED that 150 is achievable cheaply; Chair may lower, but the resolution must be <= 1 pt per case.
2. On the new set, V2 must pass all 7 gates twice byte-identical (as V2 did) and drift must be at least 1 case under the limit; otherwise PR-2 does not ship and the router gets a documented follow-up instead of a tuned threshold.
3. PR-2 adds a unit test that fails on main (tech vote .481 -> not fallback; .5 boundary exact). Failing-first evidence per AGENTS.md s2.
4. Probe "help me setup the tutor" is added as a lesson case (expect tutor-loop) before PR-2; if it still redirects at BATCH=1, name it as a known regression in the PR and ADR 0001 results table.
5. PR-2 description reports per-case flips (c-solid-2, c-obs-1, h-d-ai-art, h-trap-token-arcade out; c-bff-2 in) so a reviewer sees the trade.
6. No new C1'/self-vote rule and no threshold tuning on any already-scored case.
7. EVIDENCE_LOG.md entry after PR-2 (T2).

Dissent noted: if the Chair accepts the 1-case gate as is, A is defensible only with a written "zero slack" caveat in ADR 0001; I do not recommend it.
