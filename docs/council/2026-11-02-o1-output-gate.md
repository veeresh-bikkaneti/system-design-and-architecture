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
