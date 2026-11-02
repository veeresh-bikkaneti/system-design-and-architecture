## Make Ben's eval trustworthy: batch-independent index, eval on PRs, bigger blind holdout

**Why this ticket exists.** Ben's routing is judged by `eval:ben`. Today that judge is noisy, runs too late, and has a holdout that has been looked at too often. Every Ben change (the chunker in #135, the drift work) ended up arguing with the instrument instead of with the code. This ticket fixes the instrument so the course and the chatbot stay protected.

### The three problems (evidence)

1. **The index is built in batches of 32, but the browser embeds one question at a time.**
   - `scripts/ben/build-index.mjs` has `BATCH = 32`. The q8 model shares one quantization scale across a batch (24 `DynamicQuantizeLinear` nodes), so the same chunk embedded alone vs inside a batch differs: cosine 0.992 to 0.993 in the test, not 1.0. Embedding the same text twice in one batch matches exactly.
   - Effect: any change in chunk count moves every later vector, so accuracy swings about 2 points by itself. Unchanged chunks moved by up to 0.0255 in similarity score, more than the margin of several eval cases.
   - `BATCH=1` fixes the cause. Index build time went from 12.1 s to 12.5 s.
   - **Catch:** `BATCH=1` alone fails the drift gate (4.3% vs the 3.0% limit), because `main` passes that gate partly through batch luck. It must land together with a router drift fix. A measured candidate exists (C1' + C2: drift 1/69, holdout 42/48 at BATCH=1) but it needs a rewrite of a documented decision comment and the sign-offs listed in the council notes. Do not ship `BATCH=1` alone.

2. **`eval:ben` only runs after a push to `main`.**
   - `.github/workflows/deploy.yml` runs it on push to `main`; the only `pull_request` workflow is `codeql.yml`. A routing regression shows up as a red deploy, after the merge.
   - `npm run eval:ben` also fails at startup on Windows (cmd cannot parse the script's `;`). Running `npx vitest run --config vitest.eval.config.ts` works.
   - All measurements so far came from Windows. Linux numerics are UNVERIFIED for the BATCH=1 index (CI's post-merge run on `main` passed for the current BATCH=32 index).

3. **The holdout is too small and no longer blind.**
   - `evals/ben/holdout.json` has 48 cases, 20 of them off-course. By rule of three, certifying drift at or below 3% needs about 100 off-course cases with zero misses.
   - The current holdout was read case by case while designing the drift rules, so ADR 0001 section 7 applies: fold it into `cases.json` and write a new one.
   - An agent-written holdout cannot prove independence from the router's own model. The author should be a human, or an agent that attests it read no eval output, REPORT.md, router code, or scratch files.

### Scope (in order)

1. Batch-independent index build (`BATCH=1`) with a test that the same chunk gives the same vector alone or in a batch (skips cleanly when the model is absent). Ships only with the drift fix; see above.
2. A PR-triggered, path-filtered `eval:ben` job (paths: `src/ai/local/**`, `scripts/ben/**`, `evals/ben/**`, `content/lessons/**`). Fix the Windows script quoting. Raise the eval setup timeout only as needed so no gate test is skipped.
3. Fold the current holdout into `cases.json`; author a new blind holdout of about 100 off-course plus on-course cases; record the author attestation in the PR.

### Acceptance

- Eval numbers are identical across two runs, and unchanged chunks keep the same vectors when other chunks are added or removed.
- `eval:ben` runs on a PR that touches Ben files and blocks the merge on a red gate.
- All 7 gate tests run, none skipped.
- PR wording says "passes the gate", not "improved", until the new holdout exists.

### Out of scope

The chunker sentence-boundary fix (#135) and any Veer/GitHub-login inference work. Both depend on this ticket and are tracked separately.

### Not verified

Browser versus Node embedding parity, and Linux behavior of the BATCH=1 index.
