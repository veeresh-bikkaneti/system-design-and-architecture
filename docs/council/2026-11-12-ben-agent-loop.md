# Council record: Ben agent loop (Branch 16, Ben upgrade — Shape C as amended)

Tier T2 (escalated to full council by the manifest — new runtime surface, ~1.2 GB learner downloads on the normal WebLLM rung, external API blast radius). Branch: `feat/ben-agent-loop`. Base: `fix/ben-howto-route` @ `65c14ed` (branch 3 tip, PR #235; the stack is 2 ← 3 ← 16 — the loop consumes branch 3's `howto` route, which does not exist on main; remote tip verified via the GitHub API on 2026-11-12).
Procedure: AGENTS.md §3. Source manifest: PSTACK Arena Record + Consensus Manifest, 2026-11-12, Part I §I.6 (Shape C as amended) and Part II, Branch 16 (recorded in the commission workspace; this file summarises that branch's manifest entry and carries the advisor verdict for this branch verbatim, as AGENTS.md §3 step 7 requires).
Owners (manifest): Seat C (mid-build boundary calls: when the loop may fire, discard/fallback thresholds, tool-set freeze), Seat D (ADR amendment Ben increment), Seat B (test contracts), Seat A (device-scenario acceptance matrix co-sign).
Round: **1 of 2**.
Model diversity: **no model diversity** — all council seats ran on one model family this session (manifest §II.1).
Implementing agent: **builder seat (model name withheld per commission instruction)**.

## Consensus Manifest summary (Branch 16)

```text
CONSENSUS MANIFEST
Task: the Ben upgrade, Shape C as amended — a code-driven tool loop that
  serves ONLY the parametric_fallback route and branch 3's howto route.
  Deterministic steps: lesson re-retrieval (existing embed/rank) →
  Wikipedia lookup under Part I's privacy conditions → synthesis (model)
  or extractive answer (no model). The router stays sovereign; lesson /
  clarify / self / redirect turns are untouched, and the loop never
  blocks or replaces a grounded answer (grounded-first invariant).
Risk tier and rationale: T2, full council — new runtime + external API
  (Wikimedia) + learner downloads; failure isolation is structural (the
  loop sits downstream of buildTurn on two branches only).
Scenarios / acceptance conditions (Seat A matrix, all must hold):
  - no-WebGPU phone → sovereign router answers, confidence line discloses
    the missing tier, no blocked turn, no error screen
  - mid-answer Wikipedia timeout / 404 / title-mismatch → answer completes
    from re-retrieval alone, vote drops mechanically, mismatched /
    disambiguation results discarded by the relevance check, never
    synthesised from
  - install question, OS unspecified → branch-3 behaviour (one OS
    question); OS named → OS-branched answer from retrieved sources with
    citations; never a conceptual lesson, never a redirect
  - ordinary course question → loop does not fire; HEAD behaviour identical
  - offline → grounded lesson answer from the local index
  - LanguageModel state change mid-session → consent before any
    browser-model download; feature detection (never UA sniffing) picks
    the rung every session
  - citations assigned BY CODE from sources actually retrieved this turn
    (a citation for an unretrieved source is a BLOCKER defect);
    confidence computed BY CODE with the shared post-condition (sources
    empty ⇒ forced low + no-source wording) on BOTH answer paths
Failing tests or test contracts: Node-testable loop logic with MOCKED
  tools, failing-first where behaviour is claimed — the five commissioned
  classes: (a) tool calling (routing into the loop, step sequencing,
  discard/fallback paths); (b) web-search answer with citations, incl.
  the identifier-planting test (a planted identifier in a retrieved page
  must not leak; and the minimised query never carries the student's
  sentence or any identifier in it); (c) no-source case votes low on both
  paths; (d) weak-device model choice (ladder unit tests, stubbed
  LanguageModel.availability + stubbed WebLLM config, exact pins,
  config miss fails loudly); (e) the #199 question end-to-end in Node.
  npm run eval:ben REQUIRED (src/ai/local/ changes) — sovereign gates
  green, holdout-only reported alongside combined.
Scoped files (maximum 3; justify any exception): the manifest records
  the >3-file exception for this branch — loop module, inference.ts,
  QaChatPanel.tsx, web.ts confidence consolidation, eval fixtures
  (manifest §II.2 branch 16). In full, as built:
  src/ai/local/agentLoop.ts (NEW sibling loop module + Wikipedia client
  + canonical-term derivation + consent store), src/ai/local/agentLoop.test.ts
  (NEW; the five commissioned classes), src/ai/local/inference.ts (model
  ladder: exact pins, weak-device rung, loud config-miss failure,
  Prompt-API synthesis entry for the loop), src/ai/local/inference.ladder.test.ts
  (NEW; class (d)), src/ai/local/web.ts (the shared confidence
  post-condition, used by both loop answer paths),
  src/components/qa/QaChatPanel.tsx (panel glue only: fire the loop on
  the two routes, render its sources/confidence, first-use disclosure,
  opt-out phrase), docs/adr/0001-ben-semantic-routing.md (the Ben
  increment, pushed BEFORE loop code), evals/ben/REPORT.md
  (command-regenerated by the eval run, as on branch 3). This record and
  the EVIDENCE_LOG.md entry are the T2 record duty (AGENTS.md §3
  step 7), not additional code scope. NO worker/ touch. NO eval-fixture
  edits: routing is unchanged by this branch, so cases/holdout are
  untouched and the eval is run as the no-regression gate, not edited.
Risks / unknowns: WebLLM synthesis-tier output hygiene — see the DEFER
  disposition under Boundary calls. Browser-leg behaviour is UNVERIFIED
  (Node tests ≠ browser proof) and is labelled so in the PR.
Rejected alternatives and why: Shape A (loop mediates all turns) and
  Shape B (unified agent runtime) — rejected in the arena (Part I §I.3,
  §I.5): A has 100% blast radius and the draft-fit conflict; B makes the
  required eval:ben gate un-runnable and was already adjudicated by ADR
  0001's Alternatives. DuckDuckGo in any role — DROP (Part I fact #7:
  not search, CORS inconsistent, terms-encumbered). Native WebLLM
  function-calling — not used (WIP, Part I fact #3); the loop is
  code-driven, the model synthesises only.
Token budget (maximum 15,000): per AGENTS.md §4 default for the task.
Approvals / votes / dissent: full council manifest passed ≥3 of 4
  non-Chair seats (manifest §II.1); advisor verdict for this branch
  below — AGREE WITH NOTES, all notes NON-MATERIAL.
Chair decision (including any veto): proceed under the manifest; no veto recorded.
```

## Preconditions — statement (manifest Branch 16, hard)

Branches 1, 2, and 3 are built and SWARM-gated: S1, S2, S3 all PASS (source: `pstack-correct-handback-2026-11-12.md`, commission workspace — branch 3's section states "branch 16's preconditions (branches 1, 2, 3 built + gated) are now all met"). The advisor step (§II.1) is logged by the verbatim verdict below. The ADR amendment Ben increment lands at this branch's head before any loop code (commit 2 of this branch).

## Erratum (advisor branch-16 note 1, NON-MATERIAL)

The arena text's "branch 15" references to the loop — Part I §I.6 ("the ADR amendment Ben increment lands at the head of branch 15") and branch 3's scope-out line ("branch 15 consumes this route") — mean **branch 16** under the final §II.2 numbering: branch 15 is `content/sources-linking-pilot`; the agent loop is branch 16, and the ADR Ben increment lands at this branch's head. This corrects a pointer only; it changes no scope, test, or acceptance term.

## Boundary calls (Seat C holds them for this branch — recorded before code)

1. **DEFER trigger FIRES for the WebLLM synthesis tier.** Output hygiene for Qwen3 under WebLLM (no leaked think traces, token budget) cannot be verified in-branch: the existing output gate (`sanitize.ts`) has no think-trace handling (verified by grep at this branch's base — no `think` handling in `sanitize.ts`), Qwen3's thinking-mode control in WebLLM is UNVERIFIED (Part I fact #3), and Node tests cannot prove in-browser engine output. Per the binding trigger, the WebLLM tier **defers**: the loop ships Prompt-API synthesis + extractive answers. The ladder code (exact pins, weak-device rung, loud config-miss failure) is implemented and unit-tested with stubbed config, but the production WebLLM load path keeps the current model — selected by exact ID, not the F9 `startsWith` lookup, which is not carried forward — until a real-device pass verifies the Qwen3 tier. Recorded in the ADR increment, the PR, and EVIDENCE_LOG.
2. **Wikipedia fit/relevance bar.** ADR §5's fit check is revived for the extract: the extract is embedded and must clear **0.25** cosine against the question (below the 0.45 lesson bar — a Wikipedia extract is long-form, so its whole-text similarity runs lower than a lesson section's; the bar evidences aboutness, never coverage), AND the result title must share a content token with the canonical query term. A disambiguation page is discarded by construction (title check + fit). Either failure discards the result; the answer completes from re-retrieval alone and the vote drops mechanically.
3. **Canonical query term.** Derived by code from the question's content tokens (the existing `tokenize`, stopwords removed): for the how-to class, the tokens after the install/set-up phrasing (the tool name, e.g. `docker`); otherwise the first three content tokens. The student's sentence is never sent; a planted identifier in the *question* therefore cannot leave (identifier-planting test, question side), and a planted identifier inside a *retrieved page* is never copied into the query (the query is derived before any fetch) nor cited (citations name title + URL only).
4. **Opt-out recognition.** Remembered opt-out is set when a student message matches a plain no-web phrase (`don't use the web`, `no wikipedia`, `stop using wikipedia`, `opt out`, and close variants) — a deterministic phrase check in the panel glue, recorded here; no model inference. Opt-out degrades the loop to re-retrieval + extractive (today's parametric behaviour floor).
5. **CSP: no widening needed.** The manifest names CSP `connect-src` widening in scope; at this branch's base `index.html` already carries `connect-src 'self' https:` (verified first-hand), so a Wikipedia fetch is already permitted and no CSP change is made. Recorded so the absence of an `index.html` diff is a finding, not an omission.
6. **Download sizes in learner copy** keep the **likely** confidence mark (Part I fact #2: secondary sources only) unless measured in-branch; this branch does not download either Qwen3 model (deferred tier), so the mark stands wherever the sizes are named.

## Advisor verdict for this branch — VERBATIM

Source: advisor report, PSTACK CORRECT T2 branches, 2026-11-12, §7 (Branch 16 — `feat/ben-agent-loop` (Ben upgrade, Shape C amended) — T2, full council). Reproduced exactly:

> **Verdict: AGREE WITH NOTES**
>
> **Shape faithfulness:** Verified. The branch implements Shape C as amended — the arena winner (Arena/Manifest §I.6 — verified) — and not Shape A or B. Shape B's rejection is constitutional, not preferential: `eval:ben` cannot execute a browser-LLM router, so a required §11 gate would be NOT RUN and the change unmergeable under AGENTS.md §2 (Arena/Manifest §I.3, §I.5 — verified). Shape A's harvested elements (deterministic citation/confidence assembly, bounded tool discipline, grounded-first invariant) are present in the branch text, and its rejection rationale (loop mediating lesson turns, 100% blast radius, no boundary fix) is respected by the branch's scope-out of any lesson-turn mediation (Arena/Manifest §II.2 branch 16 — verified).
>
> **Preconditions (hard) — checked, all present in the branch text (verified, Arena/Manifest §II.2 branch 16):** branches 1, 2, and 3 built and gated first; the ADR amendment Ben increment (Seat D) pushed at this branch's head before code; the advisor step (§II.1) logged — this report, once recorded on the remote per AGENTS.md §3 step 7, satisfies the third for this branch (verified as procedure, AGENTS.md §3 step 7).
>
> **Fences — checked one by one (all verified, Arena/Manifest §II.2 branch 16 and Part I §I.6):** code-driven loop only (code decides tools; the model synthesises only); tools v1-frozen at lesson re-retrieval + Wikipedia API only; DuckDuckGo banned in any role, and a builder reintroducing it stops the branch (Seat C); no native WebLLM function-calling (WIP — Part I fact #3, verified); no new external service or API key (that would be an owner escalation); privacy posture reversal declared and conditioned — ADR amendment naming the exception, query minimisation by construction with the identifier-planting eval test, first-use in-chat disclosure + remembered opt-out, Wikipedia firing only on the tech/parametric path, ADR §5 fit check revived, CSP `connect-src` widening named in scope; citations assigned by code from sources actually retrieved this turn (a citation for an unretrieved source is a BLOCKER); confidence computed by code with the shared post-condition (sources empty ⇒ forced low) applied to both answer paths; no "thinking" copy; model ladder pinned to exact IDs `Qwen3-1.7B-q4f16_1-MLC` / `Qwen3-0.6B-q4f16_1-MLC` with a config-lookup miss failing loudly in tests; size disclosure + consent before any download; WebLLM tier DEFER trigger if output hygiene cannot be verified in-branch; no `worker/` file in the recorded >3-file exception (loop module, `inference.ts`, `QaChatPanel.tsx`, `web.ts`, eval fixtures).
>
> **Tests / acceptance:** Verified sufficient and measurable — loop logic Node-testable with mocked tools (Seat B condition), ladder unit tests pinning exact model IDs and built-in → WebLLM order, the identifier-planting privacy test, `npm run eval:ben` REQUIRED with sovereign gates green, and Seat A's six-scenario acceptance matrix (no-WebGPU phone; mid-answer Wikipedia timeout/404/mismatch; OS-unspecified install question; ordinary course question with the loop not firing; offline grounded answer; mid-session `LanguageModel` state change) (all verified, Arena/Manifest §II.2 branch 16). The browser-model synthesis leg must be labelled UNVERIFIED in the PR until a real-device pass exists; presenting `eval:ben` green as proof of that leg is itself a Phase 5 blocker (Seat A condition 5, branch 16 text — verified).
>
> **Notes (all NON-MATERIAL):**
> 1. [NON-MATERIAL] Stale cross-reference erratum: Part I §I.6 states the ADR Ben increment "lands at the head of branch 15", and branch 3's scope-out line says "branch 15 consumes this route" (Arena/Manifest §I.6; §II.2 branch 3 — verified) — but in the final §II.2 numbering, branch 15 is `content/sources-linking-pilot` and the agent loop is branch 16, whose own precondition correctly states the amendment is "pushed at this branch's head" (Arena/Manifest §II.2 branch 16 — verified). Builders follow the branch 16 text; the coordinator should record the §I.6 / branch-3 references as a numbering erratum in the remote record so no builder pushes the ADR increment to the sources-pilot branch. This corrects a pointer only; it changes no scope, test, or acceptance term.
> 2. [NON-MATERIAL] Learner-facing download-size disclosure must use figures measured in-branch, or keep the "likely" confidence mark: the Qwen3 sizes (~1.2 GB / ~335–376 MB) rest on secondary sources only (Part I fact #2, marked likely — verified; Arena/Manifest §II.5 item 2 makes measured sizes a branch-16 evidence obligation — verified). An unmarked secondary-source figure in learner copy would breach the citations gate this branch is bound by.
> 3. [NON-MATERIAL] Seat C holds mid-build boundary calls on this branch — when the loop may fire, discard/fallback thresholds, tool-set freeze (branch 16 owner line — verified). Any builder uncertainty on those three questions goes to Seat C, not to improvisation and not to Liz, per the manifest's orchestrate-don't-escalate standing order (Arena/Manifest §II.1 — verified).
>
> **Conditions a builder must honour:** preconditions 1–3 gated before the first commit of loop code; ADR Ben increment at the branch head before code; tool set frozen; honesty conditions of Part I §I.6 in full; per-scenario acceptance table in the PR with run evidence or UNVERIFIED labels; `EVIDENCE_LOG.md` entry (T2) (all verified, Arena/Manifest §II.2 branch 16).
>
> ---

## Outcome

Round 1 of 2. Advisor: AGREE WITH NOTES (3 notes, all NON-MATERIAL). CORRECT may proceed on this branch (AGENTS.md §3 step 4) once this record is pushed to the remote (AGENTS.md §3 step 7). Sequencing for this branch (binding): (1) this record, (2) the ADR 0001 amendment Ben increment — pushed before any loop code, (3) loop implementation in small commits, (4) tests + eval fixtures (the eval run; fixtures untouched — routing unchanged), (5) EVIDENCE_LOG entry.
