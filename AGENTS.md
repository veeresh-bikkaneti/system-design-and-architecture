# AGENTS.md — System Design Mastery (system-design-and-architecture)

> **Adoption note:** Adopted for `veeresh-bikkaneti/system-design-and-architecture` on 2026-10-26. The bracketed fields in **Project-specific configuration** (§11) and the §3 risk paths were filled from this repository's own evidence (existing AGENTS.md, `package.json`, README, workflows, and the paths named there — each existence-checked); the inherited source-project examples were removed. Nothing was copied from another repository without being verified here.

## 1. Authority and precedence

Apply instructions in this order, from highest to lowest:

1. **Frozen core** — the invariants in this file.
2. **Council decisions** — approved task decisions and the signed Consensus Manifest.
3. **Task plan** — the agreed scope and implementation plan for the current task.
4. **Request** — the immediate user request.

Higher precedence wins. If a request conflicts with the frozen core, do not silently comply: state the conflict and explain that the frozen core takes precedence. Do not weaken or reinterpret an invariant to make a task appear compliant.

## 2. Frozen core: working discipline

- **Resolve ambiguity with evidence first.** Inspect the repository, tests, history, and available documentation before deciding. Do not silently invent facts. If uncertainty remains and the task can proceed safely, choose the narrowest reversible assumption, label it **UNVERIFIED — low confidence**, and record it in the manifest. Stop and request a decision only when uncertainty affects safety, authorization, irreversible effects, or makes acceptance impossible.
- **Agree on a plan before implementation.** No implementation code until the plan and required Consensus Manifest are approved for the task’s risk tier.
- **Be surgical.** Change only the exact lines or smallest named scope needed. Follow YAGNI: do not refactor, broaden scope, or add speculative abstractions.
- **Test behavior changes first.** Add or update a test that demonstrates the failure before applying the minimal fix. Confirm it fails for the intended reason, then make it pass.
- **Surface blockers immediately.** Do not conceal, defer, or work around a blocker that changes scope, risk, or correctness.
- **Report QA findings as soon as they are found.** Distinguish verified results from suspected issues; do not wait until the final report.

## 3. Risk tiers and review path

Classify each task before implementation. When the tier is uncertain, use the higher tier until the Chair resolves it. An explicit project-owner tier may raise a task’s tier; it may lower one only with a recorded rationale.

| Tier | Typical scope | Required process |
|---|---|---|
| **T1 — High risk** | Authentication, authorization, identity, sessions, secrets, keys/tokens, security/privacy-sensitive flows, data loss, or repository-designated critical paths | Full council: Chair plus A, B, C, and D. Apply the council pass rule below. |
| **T2 — Material** | New feature/module, public API or schema change, broad behavior change, or work spanning multiple coupled areas | Chair plus Skeptic (C). Both review the manifest and plan before code. Escalate to full council if risk warrants it. |
| **T3 — Direct** | Bounded, low-risk change with clear scope, such as a typo, isolated copy/config change, or a well-understood small fix | Direct execution. Create and approve a concise manifest/plan before code; no full council unless requested or the risk changes. |

**Critical T1 paths verified in this repository (existence-checked 2026-10-26):** `worker/` — the Cloudflare Worker holding the GitHub OAuth code-for-token exchange; the OAuth client secret and the worker's other secrets live only there (`worker/README.md`). `src/store/session.ts`, `src/lib/gist-sync.ts`, and `src/components/AuthBar.tsx` — GitHub sign-in, session state, and the token handling around them. Changes touching these paths are T1. (The template's inherited example paths from its source project were replaced by this list; paths named in this repository's older documentation but no longer present — e.g. the retired BYOK files `src/ai/client.ts` and `src/store/aiSettings.ts` — are deliberately not listed.)

### Council seats

A full council has five seats:

- **Chair:** owns the decision and may veto; ensures scope, risk, and evidence are addressed.
- **A — Scenarios:** identifies user, system, and edge-case scenarios and acceptance conditions.
- **B — Unit tests:** defines test contracts and the expected failing-first evidence.
- **C — Adversarial skeptic:** challenges assumptions, scope, security, failure modes, and alternatives.
- **D — Historian:** checks repository history, prior decisions, existing patterns, and relevant project records.

**Full-council pass:** at least **3 of the 4 non-Chair seats** support the proposal, and the Chair does not veto. Record votes and any dissent. A veto blocks implementation until resolved. Limit debate to **two rounds**; if there is no decision after round two, invoke the budget-exceeded procedure.

## 4. Consensus Manifest — required before code

No implementation code without an approved manifest. Keep it concise and specific to the task. The approval path follows the risk tier above; the manifest is required at every tier.

```text
CONSENSUS MANIFEST
Task:
Risk tier and rationale:
Scenarios / acceptance conditions:
Failing tests or test contracts:
Scoped files (maximum 3; justify any exception):
Risks / unknowns:
Rejected alternatives and why:
Token budget (maximum 15,000):
Approvals / votes / dissent:
Chair decision (including any veto):
```

A manifest is not approval to exceed the frozen core. If scope grows, risk changes, or more than three files become necessary, stop before expanding the edit: update the manifest and obtain the required approval.

## 5. Evidence and uncertainty

- Make factual claims from evidence actually inspected: source, tests, repository history, command output, or a reliable source.
- When a fact is not verified, label it **UNVERIFIED** and state the confidence as **low**. Do not present an inference as a fact.
- Never invent a URL, citation, command result, test result, or repository convention. If a URL cannot be verified, say so.
- In reports, separate **verified**, **inferred**, and **UNVERIFIED** information.

## 6. Orchestration and verification

- Parallelize only work on different files that has no dependency between tasks. Do not parallelize edits to the same file or work that requires another task’s result.
- Track every delegated or parallel task with this exact shape:

  ```text
  {task_id, status, owner, evidence, blocker}
  ```

- Give each worker a self-contained brief: task, exact scope/files, relevant context, commands to run, and required evidence/report. Do not assume the worker can see this conversation.
- Verify each increment against its acceptance conditions and the project’s configured quality gates. The verify/fix loop is limited to **3 iterations**. A test command that was not run must be reported as not run, never as passing.

## 7. Token economy and prompt quality

- Optimize for **useful verified progress per token**, not response length or number of agents. Read the smallest relevant context first; expand only when evidence or dependencies require it. Prefer targeted searches, file ranges, summaries with evidence pointers, and focused diffs over dumping whole repositories or repeating history.
- Maintain a compact working state: objective, constraints, decisions, open risks, next action, and evidence references. Do not restate settled context unless needed by a new worker or decision-maker.
- Make each agent/worker prompt self-contained but lean. Specify: **role, objective, relevant context, constraints, exact task, available tools/sources, expected output, acceptance criteria, and stop/escalation conditions**. Include only context that changes the action or judgment.
- Delegate only when parallelism or isolated context is likely to save time or improve evidence enough to justify the coordination and token cost. Avoid duplicate research, redundant reviewers, and delegation of trivial work.
- Reserve the 15,000-token task budget for the full task, including planning, delegation, review, and fixes. Track budget at meaningful checkpoints; if the estimate is unreliable, say so rather than implying precision. Never trade away required evidence or safety checks merely to save tokens.
- Use concise outputs with traceable evidence. Report conclusions first, then the minimum supporting facts, paths/commands, uncertainty, and next step. Do not fabricate compression: preserve caveats and dissent that could change a decision.

## 8. Graph engineering and agentic workflows

Model a workflow as a graph when it has meaningful dependencies, branching, parallel work, retries, or multiple agents. Do not force graph ceremony onto a trivial one-step task.

- Represent work as **typed nodes** (decision, action, tool call, test, review, or human approval) and **explicit edges** (dependency, data/evidence flow, control flow, or escalation). Each node should have an owner, input, expected output, acceptance condition, and failure/stop behavior where relevant.
- Keep the execution graph acyclic by default. Make loops explicit, bounded, and observable; retries must have a reason, a limit, and a changed condition or new evidence. Respect the task’s maximum of 3 fix/verification iterations.
- Parallelize only independent nodes. Record prerequisites and shared-file boundaries so independent-looking work does not race or overwrite another result. Join parallel branches at an explicit verification/review node before relying on their combined result.
- Preserve evidence lineage: decisions and outputs should point to the files, tests, tool results, or sources that support them. A node marked complete without its required evidence is not complete.
- For tool-using agents, define allowed actions, side effects, budget, and stop conditions before execution. Prefer read-only and reversible actions first; require the appropriate authorization for consequential or irreversible actions. Verify tool results rather than assuming success from a call.
- Keep the graph proportional to risk. Use a short task checklist for small tasks; use a DAG/workflow specification for multi-stage or multi-agent work. The task manifest remains the source of truth for scope and approval.

## 9. Hard limits and escalation

- Council debate: maximum **2 rounds**.
- Fix/verification loops: maximum **3**.
- Task budget: maximum **15,000 tokens**.

If any limit is reached or forecast to be exceeded, stop expanding work and report exactly:

```text
BUDGET EXCEEDED
```

Then provide the reason, current evidence, remaining risks, and options. The **Chair decides** whether to narrow scope, defer work, or authorize a revised plan. Do not continue implementation beyond the limit without that decision.

## 10. Iterative improvement loop and increment record

For each increment, use this bounded loop:

```text
Plan → Execute the smallest approved change → Measure against acceptance criteria
     → Inspect evidence and failure modes → Learn / record → Continue, revise, or stop
```

The loop is evidence-driven, not an invitation to expand scope. Continue only when the next increment remains within the approved manifest and budget. If evidence changes the risk, assumptions, files, or acceptance criteria, pause and obtain the tier-appropriate plan/manifest update before proceeding. Stop when acceptance criteria pass, the remaining issue is explicitly deferred, a hard limit is reached, or a blocker requires a decision.

After every increment, record:

1. The increment completed and the files/lines changed.
2. Relevant numbers: tests run/passed/failed, checks completed, and remaining budget or loops when known.
3. Judgment calls made, with the evidence or rationale.
4. Blockers, risks, and unverified items.
5. **One or two** proposed process improvements at most. Do not turn process suggestions into scope without approval.

## 11. Project-specific configuration — complete for this repository

- **Project name and purpose:** System Design Mastery — a free, browser-only system design course (39 interactive MDX lessons across beginner, intermediate, and advanced tracks at adoption time) published to GitHub Pages, with an on-device AI tutor (Ben, `src/ai/local/`) and recorded US + UK narration for every lesson. (`package.json` name: `system-design-mastery`; README.md.)
- **Critical T1 paths/data/assets:** `worker/` (GitHub OAuth exchange; the OAuth client secret and worker secrets live only there), `src/store/session.ts`, `src/lib/gist-sync.ts`, `src/components/AuthBar.tsx` (sign-in, session, token handling). All existence-verified 2026-10-26.
- **Stack/runtime/package manager:** Vite 8 + React 19 + TypeScript; lessons are MDX under `content/lessons/` compiled at build time; Zustand stores under `src/store/`; a Cloudflare Worker in `worker/`; npm with a committed `package-lock.json` (CI installs with `npm ci`); static deploy to GitHub Pages via `.github/workflows/deploy.yml`, worker deploy via `deploy-worker.yml`, CodeQL via `codeql.yml`.
- **Required test and quality-gate commands:** `npm run content:validate` and `npm run content:check` (lesson structure), `npm test` (Vitest), `npm run lint` (oxlint), `npm run build` (typecheck + build + prerender + snapshot budget; SEO artifacts must be generated with `VITE_BASE_PATH=/system-design-and-architecture/`), `npm run test:e2e` (Playwright), and — whenever `src/ai/local/` changes — `npm run eval:ben` after reading `docs/adr/0001-ben-semantic-routing.md`.
- **Repository-specific conventions or constraints:** Operational detail lives in the annex, `docs/agent-notes.md` — the owner-communication rules in full, the Commands list, the Architecture map, and the evidence-log format, carried over verbatim from the previous AGENTS.md at adoption. In brief: Replies to the owner use the ADHD shape (lead with the next action or result, numbered steps, minimal context; detail lives in files). Append an `EVIDENCE_LOG.md` entry, in its existing format, after every T1/T2 task. Every lesson ends with a Sources & further reading section citing primary sources. A lesson is not done without its recorded narration packages (`scripts/tts/` pipeline: extract → synthesize → validate → regenerate the narration index); browser text-to-speech is a fallback, never the featured audio. Never commit locally generated `public/` SEO artifacts (sitemap, feed, llms.txt, OG images) — the deploy workflow regenerates them with the correct base path.
- **Project owner / Chair:** Liz, the repository's owner-operator. `main` is gated by an active GitHub ruleset ("Protect main branch", read via API 2026-10-26): changes land by pull request and merge only on her approval.

Do not claim a configured command or convention is mandatory until it has been verified in this repository. Keep this section short; task-specific detail belongs in the task plan or project documentation.
