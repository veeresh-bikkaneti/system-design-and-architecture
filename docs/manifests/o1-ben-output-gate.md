# CONSENSUS MANIFEST: O1 Ben output gate (issue #154)

Status: DRAFT, awaiting Skeptic + advisor approval. Phase 1 (manifest + failing tests) only; no implementation.

**Task:** QA R-01 (Blocker): Ben's on-device model echoes its system prompt / config-like lines into the visible answer, which is then persisted (`sd.qa.history`) and re-fed via `priorTurns`. QA R-26 (Minor, UNVERIFIED): confirm `javascript:`/`data:` markdown links do not render.

**Risk tier and rationale:** T2 (new module, behaviour change across both model-output paths). No T1 path touched (`worker/`, `session.ts`, `gist-sync.ts`, `AuthBar.tsx` untouched). `QaChatPanel.tsx` is NOT edited (another owner). Escalates to T1 only if the worker mirror (W1) is pulled into this PR; it is not.

**Scenarios / acceptance conditions**
1. The observed leak ("CPU backend / TopK: 64, Temp: 1 / system-prompt sentence / Model:") is rejected; `answerParametrically` returns `null`, so the panel's existing path shows the deterministic `NO_SOURCE` line (QaChatPanel:397-420 already does this for `null`).
2. Same for `rewriteWithModel`.
3. A rejected draft never reaches `patchMessage`, so it is never persisted or fed back via `priorTurns` (gate sits upstream of both, inside `inference.ts`).
4. Zero false positives over the corpus of real Ben answers (below).
5. R-26: no `javascript:`/`data:` anchor renders from `ChatMarkdown`.

**Failing tests / test contracts (verified red at head of this branch)**
- `src/ai/local/agent.test.ts` > "acceptDraft echo (QA R-01)": `expected true to be false` (R-01 reproduced against current `acceptDraft`).
- `src/ai/local/inference.test.ts` > "output gate at the call site": `expected 'CPU backend\nTopK: 64, Temp: 1\nYou a…' to be null` (Prompt API mocked to echo).
- `src/ai/local/sanitize.test.ts` (16 contract tests): red with `Cannot find module './sanitize.ts'` (module does not exist yet; red for the intended reason).
- `src/components/ChatMarkdown.test.tsx` (R-26): PASSES today. Finding: react-markdown's default URL transform already drops these hrefs, so R-26 is closed as "verified not exploitable on v10.1.0"; the test stays as a regression guard. No fix needed.

**Scoped files (max 3; exception requested)**
Implementation: (1) new `src/ai/local/sanitize.ts`, (2) `src/ai/local/inference.ts` (export both prompts, gate both call sites; `acceptDraft` in `agent.ts` is left alone, the gate supersedes it for echoes). That is 2 source files.
Tests: `sanitize.test.ts`, `agent.test.ts`, `inference.test.ts`, `ChatMarkdown.test.tsx` (4 test files). EXCEPTION: test files are outside the 3-file source cap by intent; flagged for the Chair. Plus this manifest and an EVIDENCE_LOG.md entry (T2 rule).

**Design: shared pure `sanitizeModelOutput` (mirrorable by Veer worker in W1)**
```
sanitizeModelOutput(raw: string, opts: { systemPrompts: string[]; fallback: string })
  -> { text: string; rejected: boolean; reasons: string[] }
```
- No imports at all (a test asserts no relative imports). Pure, synchronous, no I/O.
- Normalise: lowercase, strip punctuation, collapse whitespace, tokenise to words.
- Rule 1, n-gram overlap: reject if any contiguous run of **8 words** from raw appears in any system prompt. Reasoning: prompts are ~35-60 words; 3-5 word runs ("system design tutor", "a patient tutor") occur in honest answers, 8 words matching verbatim by chance is vanishingly rare. 8 is a starting value to be tuned against the corpus, not a proven optimum (UNVERIFIED beyond the corpus).
- Rule 2, role labels: any line starting `system|user|student|learner|tutor|assistant|model|human|ai :` -> reject (the panel's own `priorTurns` uses `Learner:`/`Tutor:`).
- Rule 3, config-like lines: `^(topk|temp\w*|top_?p|max_?tokens|model|backend|cpu backend|seed)\s*[:=]`.
- Rule 4, template markers: `<|...|>`, `[INST]`, `<<SYS>>`, `{{...}}`, `Lesson material:`, `What you already said:`, `Student:`.
- Empty/whitespace output -> rejected.
- On any hit: `{ text: fallback, rejected: true, reasons }`. Callers pass the deterministic `NO_SOURCE` line; the Ben call sites map `rejected` to `null` (existing fallback path).
- Gate runs on the raw model string inside `inference.ts`, BEFORE it is returned to the panel, hence before persistence and `priorTurns`. The deterministic fallback line itself passes (no loop).
- Worker mirror: W1 re-implements this spec (same thresholds, same four rule lists) in `worker/`; worker paths are T1 and need their own manifest.

**False-positive corpus:** `sanitize.test.ts` runs `prepareTurn(q).answer` for all 153 `evals/ben/cases.json` questions (real deterministic Ben answers; far above the 20 required) and asserts none is rejected. Not yet run (module absent). Caveat: this corpus is deterministic card text, not real model output; model-rewrite false positives are UNVERIFIED and are covered only by the 8-word threshold reasoning plus the "short shared phrase" test.

**Risks / unknowns**
- Model confabulation ("TopK/CPU backend" matches nothing in code) is caught only by rules 2-3 lists; novel junk passes. Gate is a mitigation, not a proof. Which engine echoed is UNVERIFIED.
- Legit answers that quote config (e.g. "set Temperature: 0.2" for an LLM question) could trip rule 3; parametric answers about ML are in scope. Mitigation: anchor rule 3 to line start; accept residual false-reject (falls back to a safe line).
- `npm run eval:ben` is required after touching `src/ai/local/`; ADR 0001 read (routing is untouched; gate is wording-layer only). Not run in phase 1.

**Rejected alternatives**
- Shortening/rewording the system prompt alone: issue says no; echoed fragments include text in no prompt.
- Extending `acceptDraft` substring list: has no access to the prompts, brittle.
- Gating in `QaChatPanel.tsx`: owned elsewhere, and persistence happens there.
- A sanitize library / `rehype-sanitize` for R-26: unneeded, default transform already safe.

**Token budget (max 15,000):** phase 1 estimated within budget; estimate unreliable (not measured).

**Approvals / votes / dissent:** pending (T2: Chair + Skeptic C).

**Chair decision:** pending.

## Phase 2 amendments (council round 1: Skeptic support with changes, advisor AGREE; see docs/council/2026-11-02-o1-output-gate.md)

- **Two fallbacks, stated explicitly.** Parametric path (`answerParametrically`): a rejected draft returns `null`, so the panel shows the deterministic `NO_SOURCE` line (QaChatPanel:397-420, unchanged). Rewrite path (`rewriteWithModel`): a rejected draft returns `null`, so the panel keeps the deterministic card answer (it only patches a non-null draft). One test each in `inference.test.ts`.
- **Rules 2-4 skip fenced code blocks and table/list lines** (rule 1, n-gram overlap, runs everywhere). Residual false-reject: a bare unlisted prose line like `Temperature: 0.2 ...` is rejected; the result is a safe fallback, not a leak.
- **Acceptance wording:** the gate catches KNOWN leak shapes. It cannot catch novel confabulation, and a partial leak shorter than 8 words passes.
- **Threshold evidence:** every 8-word window of both prompts is rejected (test); a 7-word window passes (test, documented limit); the longest run shared by the prompts and the 153 card answers is below 8 (printed value in the PR).
- **Pure = no imports at all**, enforced by a test.
- **`acceptDraft` stays.** The gate runs before it in `inference.ts`. `loadEngine`'s sticky-failure cache is untouched. The `agent.test.ts` change from phase 1 was dropped (it pinned `acceptDraft` itself, which is deliberately unchanged; the call-site tests cover R-01).
- **The new tests are the only answer-text gate.** `eval:ben` measures routing only.
- **W1 (T1, later):** copies `sanitize.ts` verbatim with a CI diff check, or imports from a shared path; thresholds and rule lists must match. This PR does not touch `worker/` or `QaChatPanel.tsx`.
- **R-26 scope:** javascript:, JavaScript:, vbscript: and data: markdown links on react-markdown 10.1.0 (no urlTransform override in src). The test is a regression guard, not a claim about other vectors.
- **File count:** 8 = `sanitize.ts`, `inference.ts`, `sanitize.test.ts`, `inference.test.ts`, `ChatMarkdown.test.tsx`, this manifest, `EVIDENCE_LOG.md`, `docs/council/2026-11-02-o1-output-gate.md`.

## Round 2 amendments (Reality Checker B1; council round 2 of 2, advisor AGREE)

- **Tiered gate replaces the round-1 blanket skip.** Pipeline: NFKC, strip zero-width, line prep (strip `>`, bullets, numbers, `|`, `#`, `*_` and backtick wrappers; table rows are split into cells), tier 1, tier 2. "Segment" = a stripped line or one table cell.
- **Tier 1 runs everywhere** (fenced, listed, tabled, unclosed fence): 8-word prompt overlap (after normalisation), template markers (`<|...|>`, `[INST]`, `<<SYS>>`, `lesson material:`, `what you already said:`), engine config colon form `\b(top[ -]?k|top[ -]?p|temp|max[ _]?tokens)\s*:\s*\d` (not anchored, so `Settings - TopK: 64` is caught; `top_k` and `top_k = 64` in code pass), and a `cpu|gpu|wasm|webgpu backend` line. The `{{...}}` rule is dropped.
- **Tier 2 runs outside fences and table rows:** role labels (`system|user|assistant|human|student|learner|tutor:`), and `model:`/`temperature:`/`seed[:=]` only when bare or followed by just a number. A trailing label (the last non-empty line ends in `model|system|user|assistant|tutor|human:`) runs everywhere.
- **Unclosed fence:** closed at EOF for fence-state only. Tier 2 still skips lines after the opening fence; tier 1 and the trailing label do run there.
- **Known tier-1 false rejects (fail safe):** prose or fenced code with `Top-K: 64`, `TopK: 64`, `temp: 1`. Accepted: a false reject falls back to NO_SOURCE or the card answer; a leak is the Blocker.
- **Acceptance wording (replaces earlier):** the gate catches known leak shapes, including when wrapped in lists, tables, fences or markdown emphasis. A partial leak under 8 words, homoglyph tricks and novel confabulation can pass.
- **R-01 is not closed by this PR.** Prior-turn delimiting and role-label stripping (needs `QaChatPanel.tsx`) remain OPEN, tracked in issue #179.
- **W1 (Veer, T1)** must copy `sanitize.ts` verbatim.

## Fix loop 2 amendments (Reality Checker round 2; verification loop 2 of max 3, not a council round)

- **B1 (blocking, implementation bug):** table rows were split on `|` before the template-marker check, so `| <|im_start|>system | x |` and `|<|im_end|>|` passed. The marker test now also runs on the raw line (after NFKC and zero-width stripping) before any fence handling, splitting or stripping, in addition to per-cell.
- **Hardening inside the approved design:** (a) line prep collapses whitespace runs, so `Top  K : 64` and `Top<TAB>K: 64` match; (b) line prep strips simple HTML tags (`</?[a-z][^>]*>`, never `<|...|>` markers), so `<b>System:</b>`, `Done. <b>Model:</b>` and `<b>CPU backend</b>` are caught; (c) the trailing label allows trailing punctuation, so `Model:.` is caught.
- **Deliberate, kept as designed (known limits):** `top_k` / `top_p` with an underscore pass (legit JSON/YAML keys); a value on the NEXT line (`TopK:` then `64`); code forms `temp=1` and `top_k = 64`; 7-word prompt runs; Cyrillic homoglyphs; markup placed between prompt words.
- **Known false rejects (fail safe, kept):** mid-sentence `top-k: 64 means ...`, and answers whose last line ends in `Model:`, `System:` or `user:`. A false reject falls back to NO_SOURCE or the card answer.
