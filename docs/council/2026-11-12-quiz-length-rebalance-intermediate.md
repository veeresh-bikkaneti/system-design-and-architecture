# Council record: Quiz length rebalance — intermediate batch (F4, Branch 4, batch 2 of 3)

Tier T2. Procedure: AGENTS.md section 3. Owners: Seat B (measurement + thresholds), Seat A (content sign-off on correct-option text). Round "1 of 2". Model diversity: "no model diversity" (all seats ran on one model family this session, per the Consensus Manifest §II.1). Implementing agent: builder seat (model name withheld per commission instruction).

## Consensus Manifest summary (Branch 4, intermediate batch)

```text
CONSENSUS MANIFEST
Task: F4 quiz option-length rebalance, intermediate track batch (batch 2 of 3:
  beginner / intermediate / advanced, one branch + PR per batch).
Risk tier and rationale: T2 — broad behaviour-relevant content change across
  multiple coupled lesson files; measured learner-detectable bias
  (Phase 1 F4: correct strictly longest 149/190 = 78.4%, inclusive 152/190 =
  80.0%, correct mean 86.2 chars vs distractor mean 54.5, position uniform
  45/45/51/49 so no position shuffle).
Scenarios / acceptance conditions:
  - scripts/quiz-length-audit.py (batch 1's script, committed byte-identical
    on this branch) reproduces the HEAD baseline EXACTLY before any edit:
    149 strict / 152 inclusive / 190 questions / 760 options, means 86.2 vs
    54.5. Any other number = parser mismatch = blocker. (Reproduced exactly
    on this branch before any lesson edit — see the PR body.)
  - Post-fix, this batch: zero intermediate lessons at 100% strict (lessons
    with >=4 questions). Corpus thresholds (strict <=30%, inclusive <=35%,
    correct mean within 15% of distractor mean) are judged at the FINAL
    batch (advanced); this PR reports batch before/after plus the projected
    merged corpus (main baseline minus batch 1's verified deltas minus this
    batch's deltas), labelled as a projection, because this branch is off
    main and batch 1's beginner fixes are not in its tree.
  - correctIndex MUST NOT CHANGE for any question, asserted mechanically
    (parser diff of correctIndex sequences before vs after, all 41 files).
  - Method: lengthen distractors with plausible substance or tighten correct
    options; NEVER filler padding. Any edit to a CORRECT option's text needs
    per-question Seat A sign-off (builder cannot self-approve): such edits
    are listed in a dedicated PR table flagged PENDING SEAT A SIGN-OFF.
    Questions where parity would change what the correct answer MEANS are
    flagged for rewrite in the PR, not edited.
  - Human self-review of >=20 changed questions for "padded distractor now
    defensible", listed with verdicts in the PR (if fewer than 20 questions
    change, all are reviewed and that is stated).
  - Per-question recorded reason for any inherently-longest exemption.
Failing tests or test contracts: audit-before-edit is this branch's
  failing-first evidence (AGENTS.md section 2 analogue for a content defect):
  the baseline audit at HEAD is the failing measurement; the post-fix audit
  is the passing measurement. Audit logs captured to files.
Scoped files (maximum 3; justify any exception): EXCEPTION RECORDED per
  AGENTS.md sections 2/4 and the manifest: this branch exceeds 3 files under
  the manifest's recorded justification — batching by track, <=~14 lesson
  files per batch (the 41-file single pass was rejected as unreviewable).
  This batch: up to 15 intermediate lesson files +
  scripts/quiz-length-audit.py (byte-identical copy of batch 1's script) +
  this record doc + EVIDENCE_LOG.md entry + audit evidence files.
Risks / unknowns: a lengthened distractor could accidentally become
  defensible (mitigated by the >=20-question self-review + SWARM re-check);
  parser mismatch risk (mitigated by exact baseline reproduction gate +
  per-file correctIndex-count assertions + hand-verified samples).
Rejected alternatives and why: position shuffle (position already uniform,
  chi2=0.568 — a non-fix, rejected at review); filler padding (a new tell and
  a teaching defect); single 41-file pass (unreviewable).
Token budget (maximum 15,000): per AGENTS.md section 4 default.
Approvals / votes / dissent: Consensus Manifest Part II Branch 4 passed the
  council pass rule (>=3 of 4 non-Chair seats, Chair no veto); advisor
  verdict AGREE WITH NOTES, all notes NON-MATERIAL (verbatim below).
Chair decision (including any veto): proceed under the manifest; merges are
  the owner's word, always.
```

Batch membership (derived from the repo's own metadata — `tier: 'intermediate'`
in `content/lessons/*.mdx` frontmatter meta, verified first-hand at HEAD):
api-gateways, authn-authz, autocomplete-freshness-safety,
bff-backend-for-frontend, caching-strategies, cdns, cloud-native-architecture,
data-partitioning, idempotency, message-queues, microservices-vs-monolith,
rate-limiting, replication-consistency-models, search-autocomplete,
url-shortener (15 lessons, 66 questions). Only lessons whose quizzes need
rebalancing are edited; the edited list is in the PR body.

Gates: `npm run content:validate` + `npm run content:check`; audit
before/after committed as PR evidence; `npm run build` with
`VITE_BASE_PATH=/system-design-and-architecture/`. `npm run eval:ben` N/A —
no `src/ai/local/` change (recorded per AGENTS.md section 2).

## Advisor verdict for Branch 4 — VERBATIM

Source: advisor report recorded for this commission
(`advisor-agree-2026-11-12.md`, section 4), pasted verbatim below.

---

## 4. Branch 4 — `fix/quiz-length-rebalance` (beginner / intermediate / advanced) (F4) — T2

**Verdict: AGREE WITH NOTES**

**Faithfulness to evidence:** Verified. F4 SURVIVES — exact: correct option strictly longest in 149/190 (78.4%), inclusive 152/190 (80.0%), position uniform (χ² = 0.568, so a position shuffle would be a non-fix), correct mean 86.2 chars vs distractor mean 54.5, 20/41 lessons at 100% strict (Interrogation §1 F4 — verified). The branch method — lengthen distractors with plausible substance or tighten correct options, never filler padding — answers the measured defect and not the dismissed one (Arena/Manifest §II.2 branch 4 — verified).

**The Seat-A sign-off fence — checked, present (verified, Arena/Manifest §II.2 branch 4):** "any edit to a correct option's text needs per-question Seat A sign-off — the builder cannot self-approve (Seat C)"; `correctIndex` unchanged for all 190; questions where parity would change what the correct answer means are flagged for rewrite, not edited in this pass.

**Tests / acceptance:** Verified sufficient and measurable, and the strongest acceptance block in the manifest — the audit script must reproduce the HEAD baseline exactly (149 strict / 152 inclusive / 190 questions / 760 options) before any edit, any other number being a parser-mismatch blocker; post-fix thresholds strict-longest ≤30%, inclusive ≤35%, zero lessons at 100% strict (lessons with ≥4 questions), correct-option mean within 15% of distractor mean; human review of ≥20 changed questions for "padded distractor now defensible"; per-question recorded reasons for any exemption (all verified, Arena/Manifest §II.2 branch 4).

**Notes (all NON-MATERIAL):**
1. [NON-MATERIAL] Each track batch (beginner / intermediate / advanced) is its own branch and PR with its own before/after audit output committed as evidence; the ≤30% / ≤35% / mean-parity thresholds are corpus-level acceptance, so intermediate batches must report both their per-batch figures and the running corpus figure, and the final batch is the one at which corpus acceptance is judged. This follows from the batching already recorded in the branch text (≤ ~14 lesson files per branch, 41-file single pass rejected — verified) and changes no threshold.
2. [NON-MATERIAL] `correctIndex` invariance must be asserted mechanically (script or diff check over all edited files), not asserted in prose — Seat B owns measurement on this branch (branch 4 owner line — verified), and a prose assertion would not meet the branch's own evidence standard.

**Conditions a builder must honour:** no filler padding; no position shuffle presented as a fix; Seat-A sign-off obtained per question before any correct-option text edit lands; `content:validate` + `content:check` + build with `VITE_BASE_PATH=/system-design-and-architecture/`; `eval:ben` recorded N/A with reason (no `src/ai/local/` change) (all verified, Arena/Manifest §II.2 branch 4).

---
