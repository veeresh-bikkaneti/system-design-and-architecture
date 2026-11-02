# Council 3 shared brief (read first)

Stay ONLY inside C:\Users\veere\source\repos\system-design-course\system-design-and-architecture . Read/write nothing outside it. READ-ONLY: edit nothing tracked, commit/push nothing, no new worktrees, no subagents, no npm install. Write only your own seat file in `.claude/worktrees/_scratch/`. You may run existing vitest only inside `.claude/worktrees/m3`.

Read: AGENTS.md (T2 rules, council seats, 3-of-4 pass rule, Chair = Liz, you cannot act as Chair), docs/adr/0001-ben-semantic-routing.md, `.claude/worktrees/_scratch/drift-measure-2.md`, `drift-review-c2.md`, `c1p-c2.diff`.

## State of play
Ben is a local-first tutor (no cloud inference, no VM). Four changes in flight:
- PR #134: tutor-loop 'ai env' pin. Reviewed twice, clean. Edits router.ts, semantic.test.ts, cases.json. Not merged (needs Liz approval click).
- PR #135: chunker sentence windows. Eval -2.1 pts at BATCH=32 (mostly embedding-batch noise; 1-2 real cases); not measured at BATCH=1.
- Local branch fix/ben-index-batch-1 commit 66a3ef0: BATCH=1 index build. Alone it fails the drift gate (4.3% vs <=3%).
- Drift fix C1'+C2 (router.ts only), patched in `.claude/worktrees/m3`: at BATCH=1 drift 1/69 (limit 2/69), holdout 42/48. Round-2 Skeptic: APPROVE WITH CONDITIONS (7 conditions in drift-review-c2.md).
Known facts: eval:ben runs only on push to main (deploy.yml), not on PRs; all measurements were on Windows; the pin tests' synthetic vectors vote 'course' so they are blind to the self-vote path; on main 'Who is Michael Keaton' reportedly gets answered from any lesson scoring 0.45-0.62 (red test in m3 semantic.test.ts); the holdout is burned (ADR section 7).

## Questions (every seat answers the ones marked for it, others optional)
Q1 Is the Keaton bug real on origin/main? Is its minimal fix the SAME code as C1'? If yes it ships once with BATCH=1.
Q2 Where do the self-vote pin tests (axis-4 vectors, 'can you help me set up Ben' etc.) go: drift PR, #134, or a tiny PR first? Least churn for in-review #134.
Q3 Merge/rebase order of #134, drift PR (with BATCH=1), #135; what is re-measured after each, by whom; can #135 be deferred without losing the fragment-fix value (30 broken chunks served on main)?
Q4 Eval protection when eval:ben only runs after push to main: minimal in-scope mitigation, as a TICKET not scope.
Q5 Blind-holdout protocol if a fresh agent writes it: what it may read / must not read, attestation line; what an agent-written holdout cannot prove versus one Liz writes.
Q6 Anything missed. Also list items only the Chair can decide.

## Output (your seat file, under 40 lines)
Verdict on the joint direction: APPROVE / APPROVE WITH CONDITIONS (numbered, testable) / REJECT. Evidence with file:line. Mark UNVERIFIED. Return a 6-line summary.
