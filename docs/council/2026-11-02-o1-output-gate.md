# Council record: slice O1, Ben output gate (PR #174)

Tier T2. Procedure: AGENTS.md section 3 (Chair + Skeptic, plus the advisor check). Panel: **one seat** (Skeptic, sonnet), not a full council, as the T2 rule requires. Council lead: Sonnet 5.5. Chair of record: the owner.

## Round 1

### Seat C (Skeptic), report, verbatim

VOTE: SUPPORT WITH CHANGES. (The Skeptic could not find triage/ISSUES-CONSOLIDATED.md in its working tree, so claims about what the issue says were unchecked.)

BLOCKING
1. The rewrite path has the wrong fallback. `rewriteWithModel` is gated at inference.ts:173, and the panel only patches the bubble when a draft is non-null (QaChatPanel.tsx:441-444, 472-473). A rejected draft therefore leaves the deterministic card answer in place and never shows NO_SOURCE. Scenario 2 says "same for rewriteWithModel", which is ambiguous. State it explicitly: rewrite rejection means "keep card answer", and only the parametric path (:397-420) shows NO_SOURCE. Add a test for each. (verified)
2. Acceptance condition 4 doesn't test the thing at risk. The 153 corpus answers are card text written by the course authors (prepareTurn().answer), not model output, so zero false positives there says almost nothing. The real false-positive risk is legitimate parametric answers about LLMs, ML, or config. Rule 3 (`^model\s*[:=]`, `^temp\w*\s*[:=]`, `^seed`) and rule 2 (`Model:`) will reject a markdown table row or a `Temperature: 0.2` line. Add a "legit technical answers" accept set to sanitize.test.ts: a temperature/top-k explanation, a fenced code block containing `model: "x"` or `seed = 42`, and a table with a `Model:` cell. Decide whether rules 2 and 3 skip fenced code and list/table lines (inferred). Honest reframing: the gate catches known leak shapes; the confabulated lines appear nowhere in the code (inferred), so only a hard-coded list matches them. Put it in the acceptance wording.
3. The 8-word threshold is arbitrary (UNVERIFIED). Cheapest evidence: a test that takes each prompt's 8-word windows and shows each one is rejected; a test that takes the longest shared run between the prompts and the 153 card answers and asserts it is less than 8, printing that number in the PR. A partial leak shorter than 8 words still passes; say so in the manifest.
4. The test does not enforce the "pure function" claim. The "no relative imports" test only blocks `./` imports. State "no imports at all" or loosen the claim.

NON-BLOCKING
5. Placement is right. Both model paths (inference.ts:173 and :204) call engine.generate for both engines, so every Ben route goes through them. No Ben-side bypass found; only QaChatPanel is a consumer. Veer's server stream (QaChatPanel.tsx:355) bypasses the gate by design (W1/T1).
6. Do not call the gate acceptDraft's replacement. acceptDraft (agent.ts:393) stays and runs alongside; run the gate before acceptDraft in inference.ts. The sticky-failure cache sits in loadEngine, so touching the call sites does not affect it. Run the S1-S9 ladder tests.
7. The scope exception is justified (2 source files plus test files, T2). The fourth test file (ChatMarkdown.test.tsx) is R-26-only; say it is a no-op guard. With the manifest and EVIDENCE_LOG.md the file count is 8; say so.
8. Worker mirror. A pure function in src/ai/local is portable only by copy, and copies drift. The manifest should say W1 either copies the file verbatim with a CI diff check, or imports from a shared path; thresholds and rule lists must match. The worker is T1, so this PR must not touch worker/.
9. R-26 is verified only for this test and this version (react-markdown 10.1.0, no urlTransform override in src). Keep the claim scoped to javascript: and data: in markdown links. Add vbscript: and an uppercase JavaScript: case.
10. Tier T2 is fine; no T1 path touched. The 15k token budget is unmeasured. npm run eval:ben is required (src/ai/local changed) but only confirms routing; no answer-text gate exists in the eval (inferred), so the new tests are the only text gate. Say so.

### Verdict (council lead, Sonnet 5.5), round 1

Adopt all four blocking changes and the non-blocking ones:
1. State the two paths explicitly. Parametric path: a rejected draft shows NO_SOURCE. Rewrite path: a rejected draft keeps the deterministic card answer. One test each.
2. Add a "legitimate technical answers" accept set (temperature/top-k prose; fenced code with `model: "x"` and `seed = 42`; a table with a `Model:` cell). Rules 2 and 3 skip fenced code blocks and table/list lines. Acceptance wording says plainly: the gate catches known leak shapes; it cannot catch novel confabulation.
3. Threshold evidence: every 8-word window of each prompt is rejected; the longest run shared between the prompts and the 153 card answers is below 8 and its value is printed in the PR; the manifest states that a sub-8-word partial leak passes.
4. "Pure" means no imports at all, and the test enforces it.
5. In inference.ts the gate runs before acceptDraft; acceptDraft stays. Run the S1-S9 ladder tests and eval:ben.
6. R-26: keep the claim scoped to javascript: and data: links on react-markdown 10.1.0; add vbscript: and uppercase JavaScript: cases; label the test a regression guard.
7. W1 (T1) will copy sanitize.ts verbatim with a CI diff check, or import from a shared path; this PR does not touch worker/.
8. The manifest says the new tests are the only answer-text gate, and counts 8 files with the manifest and EVIDENCE_LOG.md.

Round count: 1 of 2. Sent to the advisor next; the reply is recorded in the following commit.

### Advisor (Opus), reply, round 1, verbatim (O1 part)

AGREE with the verdict, with one correction you must make before implementing. Your round-1 verdict faithfully captures all four BLOCKING items and the non-blocking ones. Implement it. One correction, and it is material:

The Skeptic worked without the evidence file and you didn't flag it. Its own report opens by saying it could not find triage/ISSUES-CONSOLIDATED.md and read only one-line entries from the dashboard, so every claim it made about "what the issue says" is unchecked by its own admission. That file is on main (it merged in #141 as triage/ISSUES-CONSOLIDATED.md), so the seat was looking in the wrong place or at a stale tree. Two consequences:
- Your verdict item 2 inherits the Skeptic's reframing of acceptance condition 4 without anyone having read QA R-01's actual evidence paragraph, the one naming router.ts:321-322, inference.ts:209-217, agent.ts:393-409, and the observed leak strings. That paragraph is the specification for what the gate must catch.
- Record the gap in this file (you already quoted the Skeptic's caveat), and before phase 2 starts, have the implementer re-read QA R-01 from triage/ISSUES-CONSOLIDATED.md on main and confirm the four blocking changes still cover it. That is a five-minute read, not another seat.

Everything else in the verdict stands. Do not reconvene.

### Outcome

Round count: 1 of 2. Advisor: AGREE (one material note, applied: re-read QA R-01 first). Implementer: the O1 implementer agent (a Sonnet-class model), under the council lead Sonnet 5.5. Status: phase 2 (implementation) released. Gap recorded: the Skeptic did not have triage/ISSUES-CONSOLIDATED.md; the implementer closes it by re-reading QA R-01 and confirming the blocking changes cover it.

## Round 2 (of max 2): Reality Checker blocking finding B1

Independent Reality Checker (sonnet) on head bf54b72: VERIFIED WITH CONCERNS, one BLOCKING finding (B1): the leak shapes QA observed (TopK/Temp/CPU backend/Model:) bypass the gate when wrapped in a list, a table or a fence, an unclosed fence, or when Model: trails a sentence. The round-1 skip rules that avoid false positives create the bypass. Full report: docs/council/2026-11-02-o1-rc-174-round1.md. This contradicts the round-1 decision (rules 2 and 3 skip fences/tables/lists), so the loop reconvenes (procedure step 5).

### Seat C (Skeptic), round 2, report, verbatim

VOTE: SUPPORT WITH CHANGES. The design below replaces the round-1 blanket skip. The RC's B1 is verified in the sanitize.ts I read: its skip is a real bypass. Nothing here changes tier or scope. The acceptance wording does change, so the manifest needs a line update, which is not blocking.

Pre-pass (all rules). Run NFKC and strip \u200b-\u200f\u2060\ufeff. This is two lines, needs no imports, and is cheap and safe. Add it. It covers the fullwidth TopK bypass and zero-width characters. Skip homoglyph tables (YAGNI).

Line prep. Per line, strip leading ">", bullets -*+•, \d+[.)], |, #, and *_ and backtick wrappers. For table rows, split on | and check each cell.

Tier 1: everywhere (fenced, listed, tabled, unclosed).
- Prompt 8-gram (unchanged).
- Template markers: <|...|>, [INST], <<SYS>>, "lesson material:", "what you already said:".
- Engine config in colon form at segment start: \b(top[ -]?k|top[ -]?p|temp|max[ _]?tokens)\s*:\s*\d. The class has no _, so top_k and top_k = 64 pass, and = is not matched.
- Backend line: ^(cpu|gpu|wasm|webgpu)\s+backend\W*$.
- I drop {{...}}. The RC showed it false-positives on prose, and I have no leak evidence for it.

Tier 2: outside fences and table rows, line-initial after stripping.
- Role labels system|user|assistant|human|student|learner|tutor followed by ":" and any text.
- model:, temperature: and seed[:=] only when bare or followed by just a number. This keeps "Temperature: 0.2 is a common choice" and "Model: the thing that..." passing, which resolves N1.
- Trailing label: the last non-empty line, after stripping, ends in \b(model|system|user|assistant|tutor|human)\s*:\s*$. It applies even mid-line and inside lists. This catches "Caching is good. Model:".

Fences. Toggle on a line starting with three backticks. At EOF, treat an open fence as closed. Tier 1 and the trailing-label rule ignore fence state, so an unclosed fence hides nothing from them. Tier 2 still skips fenced lines, including lines after an unclosed fence. That is accepted, since tier 1 and the trailing label still run there.

False-positive trade-off. A false reject falls back to NO_SOURCE or the card answer, which is correct but less helpful. A leak is the Blocker bug. I accept a false reject over a leak. Known tier-1 false positives are fenced JS such as "topK: 64," and prose that opens a line with "Top-K: 64". Both fail safe. I am not adding a two-key requirement; it would let the RC's single-line "TopK: 64" leak through. Tier-2 "System: a set of parts" is rejected. Accepted.

Tests (red before green; each of these inputs must fail against the current file). Every RC bypass input, verbatim (list, table, closed-fence and unclosed-fence cases, Model: trailing, "CPU backend.", "Settings - TopK: 64", "Top K: 64", "Top-K: 64", "**System:**", "> System:", "1. System:", "- <|im_start|>", fullwidth and zero-width). The accept set stays green: temperature and top-k prose, fenced model: "x" with seed = 42, {"top_k": 64}, a table with a Model column, "Temperature: 0.2 is a common choice", "Model: the thing that predicts". Add a behaviour-only red check (RC N2) that does not rely on a missing import. Keep the existing no-imports test.

Prior turns (R-01 part 2). A tracked follow-up, not a blocker. The RC and I agree. The gate keeps the leak out of history. Delimiting and role-stripping priorTurns needs QaChatPanel.tsx, which another owner holds. PR title: "fix(ben): output gate (QA R-01, output side)". Body: say "Refs R-01, does not close it"; say prior-turn delimiting and role-label stripping remain open and link a tracking issue. Never write "Closes R-01". Also state the gate catches known shapes only: a partial leak shorter than 8 words and novel confabulation can pass.

Risks. The top[ -]?k boundary is inference, UNVERIFIED against real model output. No code was run, so false-positive and bypass rates are inferred from the RC's tables. The W1 Veer mirror must copy the new file verbatim.

### Verdict (council lead, Sonnet 5.5), round 2

Adopt the Skeptic's design in full: the NFKC and zero-width pre-pass; line prep with per-cell table checks; tier 1 everywhere (8-gram, template markers, engine config colon form, backend line; drop the {{...}} rule); tier 2 outside fences and table rows (role labels, bare model:/temperature:/seed, the trailing label rule everywhere); unclosed fences treated as closed at EOF with tier 1 and the trailing label still running; every RC bypass input becomes a red test first, the accept set stays green, a behaviour-only red check is added, the no-imports test stays. PR title "fix(ben): output gate (QA R-01, output side)"; body "Refs R-01, does not close it"; follow-up issue: https://github.com/veeresh-bikkaneti/system-design-and-architecture/issues/179. Manifest acceptance wording updated: the gate catches known leak shapes; fenced/listed/tabled leak shapes are rejected by tier 1; a false reject falls back safely.

Round count: 2 of 2. Sent to the advisor next; if the advisor does not agree, the loop stops with BUDGET EXCEEDED and the owner decides (procedure step 6).

### Advisor (Opus), reply, round 2, verbatim (O1 part)

AGREE: round 2 closes, implement the tiered design. The Skeptic's design directly answers B1: tier 1 runs inside fences, lists, tables and after an unclosed fence, so every bypass the Reality Checker demonstrated is reachable by a rule. The narrowed tier 2 (bare model:/temperature:/seed only when followed by a number) resolves N1 without reopening the leak. The NFKC and zero-width pre-pass covers N3 at two lines. Dropping the {{...}} rule for lack of leak evidence is the right call. No material notes. Round 2 of 2 closes, release implementation.

Three things to put in the implementer brief, because they are where this design can be built wrong:
- "At segment start" is doing load-bearing work in tier 1. `\b(top[ -]?k|...)\s*:\s*\d` without a segment anchor will fire on prose like "...tuning knobs such as top-k: 64 in the config." The Skeptic accepted that as a safe false-reject, but the implementer needs to know whether "segment" means line-start-after-strip or table-cell-start, and the tests must pin it. Otherwise two readings ship on different days.
- Order the pre-pass before everything, including the 8-gram. NFKC after the n-gram match leaves the fullwidth bypass open on the one rule the Skeptic left "unchanged." State it as: normalize, strip zero-width, line prep, tier 1, tier 2.
- "At EOF treat an open fence as closed" must not re-enable tier 2 retroactively. The design says tier 2 still skips lines after an unclosed fence. An implementer reading "treat as closed" literally may run tier 2 over them. Both behaviours are defensible; the Skeptic picked one. Say which, and test a leak and a legit line after an unclosed fence.

Then: a fresh Reality Checker at the final head, re-running its own bypass table as red-before-green. Not another council round.

### Outcome (round 2)

Round count: 2 of 2. Advisor: AGREE, no material notes. Decisions on the three pitfalls: "segment" means the line after markdown stripping, or one table cell (split on |); the pipeline order is NFKC, zero-width strip, line prep, tier 1 (including the 8-gram), tier 2; an unclosed fence is closed at EOF for fence-state purposes only: tier 2 still skips the lines after the opening fence, tier 1 and the trailing-label rule run on them, and the tests cover one leak and one legit line after an unclosed fence. Implementer: the O1 implementer agent (Sonnet-class) under council lead Sonnet 5.5. Status: implementation released; a fresh Reality Checker follows.

## Fix loop 2 (RC round 2)

This is verification loop 2 of max 3, not a council round (the council closed at round 2 of 2). Independent Reality Checker round 2 on head 8006102: VERIFIED WITH CONCERNS, one BLOCKING implementation bug: table rows were split on `|` before the template-marker check, so `| <|im_start|>system | x |` and `|<|im_end|>|` slipped past tier 1, which the approved design says runs everywhere including tables. Fix: marker test on the raw line first. Same pass, hardening within the approved design: whitespace collapse, simple HTML-tag strip, trailing-label punctuation. Kept as deliberate limits and false rejects: see the manifest "Fix loop 2 amendments". Tests were written first and were red for the intended reason (9 failures: both B1 inputs, the (a) double-space and tab forms, the three (b) HTML forms, the two (c) punctuation forms); NBSP and ideographic space already passed through NFKC and remain as guards.

## Fix loop 3 (CodeQL alert)

- Trigger: required CodeQL check failed on bc392e3, HIGH `js/incomplete-multi-character-sanitization` at `sanitize.ts:55` (regex `.replace` of `</?[a-z][^>]*>` can leave `<script` behind for `<scr<script>ipt>`).
- Fix (adf2d46): the regex tag strip is replaced by an exported hand-written single-pass scanner, `stripTags`. It consumes through the first `>` after a tag-opening `<`, drops one dangling `>` right after a removed tag, and for an unclosed tag drops only `<name`. A leading `<` joins `>` in the wrapper strip in `prep`. The raw-line template-marker check is untouched. The other `.replace` calls are single-character-class or anchored and were left alone.
- Tests (red first: 3 failed, 66 passed; `stripTags is not a function` plus two role-with-text cases): nested-tag and doubled-opener bypasses, html-wrapped labels, unclosed tags, a no-`<script`-remnant scan, and legitimate `Array<string>`, `a < b`, `x<y>z` and a fenced TS generic passing.
- Gates: npm test 642/642, lint 0 errors, tsc -b clean, content check/validate OK, build OK, eval:ben x2 identical to a clean origin/main worktree with node_modules (88.1 overall, top-1 93.2, top-3 96.1).
- Known non-blocking gap: a tag followed by a later `>` can hide leak text (tracked in #184).
