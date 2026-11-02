# Council 4 shared brief (Ben only)

Stay ONLY inside C:\Users\veere\source\repos\system-design-course\system-design-and-architecture . READ-ONLY: no edits to tracked files, no commits/pushes/worktrees/subagents. Token cap about 40,000 per seat; if exceeded say BUDGET EXCEEDED with what you have. Write only your seat file in `.claude/worktrees/_scratch/`. You cannot act as Chair (the owner). Pass rule: 3 of 4 seats; record dissent.

Read: AGENTS.md (sections 2-5), docs/adr/0001-ben-semantic-routing.md, then `.claude/worktrees/_scratch/drift-measure-3.md` (fresh measurement on current main, all 7 gates ran, real embedder, V2 run twice identical), plus drift-review-c2.md and council-3-*.md only if needed.

## Question
Ben's index is built in batches of 32, but the browser embeds one text at a time. The q8 model shares a quantization scale per batch, so index vectors differ slightly from what the browser would compute (cosine 0.992 same text alone vs in-batch). BATCH=1 removes the mismatch. Chair chose defaults: drop C1' (self-vote redirect), keep C2 (tech answer needs > 0.5 of the tech vote). Numbers (drift limit 3.0% of 69 = 2 cases pass, 3 fail):
- V0 main, BATCH=32: overall 87.9%, holdout 87.5%, drift 1/69 (1.4%), top-1 93.1%.
- V1 BATCH=1 alone: drift 3/69 (4.3%) FAILS, holdout 83.3%.
- V2 BATCH=1 + C2: overall 87.4%, holdout 85.4% (41/48 vs main 42/48), drift 2/69 (2.9%), passes by letter with ZERO slack; drift cases trap-queue-bank and h-d-ai-art (best score 0.456 vs 0.45 lesson gate, moved from 0.443 by BATCH=1). Newly wrong: c-solid-2, c-obs-1, h-trap-token-arcade; newly right: c-bff-2. Probes: 'help me setup the tutor' lesson->redirect (BATCH=1 effect), 'who was Alan Turing' fallback->redirect (C2), 'what is a mutex' stays fallback but only ~0.03-0.04 above 0.5.
- V3 BATCH=1 + C1' + C2: drift 1/69, holdout 87.5%, but breaks env-own-openai; bare self-vote branch already gone on main so C1' now adds little.
Key insight to weigh: main's 1.4% drift passes partly through batch-composition luck; BATCH=1 shows the browser-faithful behavior is weaker. The measuring-tool ticket is #136; PR-triggered advisory eval already merged (#137); WebGPU gate PR #139 is separate. The blind holdout (ADR section 7) is burned and only 20 off-course cases exist.

Decide among: (A) ship V2 now and accept zero slack; (B) do NOT ship BATCH=1 yet: keep BATCH=32, land the bigger blind holdout first (#136 part 3), then revisit; (C) ship V3; (D) another option you can justify from evidence (e.g. a documented structural fix for the h-d-ai-art off-course lesson answer, a different C2 form, or BATCH=1 behind the new holdout). For each seat answer your assigned questions with evidence (file:line / numbers), say APPROVE / APPROVE WITH CONDITIONS / REJECT for your recommended option, give conditions as numbered testable items, and mark UNVERIFIED. Seat file under 40 lines; return a 6-line summary.
