# Consensus Manifest — publish the site to the Cloudflare mirror in the deploy pipeline

Written before code, per AGENTS.md §4. This file is the task record; the
EVIDENCE_LOG.md entry for the increment is appended after verification.

```text
CONSENSUS MANIFEST
Task: Make .github/workflows/deploy.yml publish every deployable build to
  BOTH GitHub Pages (unchanged) and the Cloudflare Worker
  `systemdesignandarchitecture` (the site mirror at
  https://systemdesignandarchitecture.knowledgetest.workers.dev/), so the
  two surfaces can never drift again. Owner decision 2026-10-28 (the
  durable-fix option, chosen over a one-off deploy or retiring the mirror).
Risk tier and rationale: T1 — the change touches the worker/ CORS allowlist
  that guards the GitHub OAuth code-for-token exchange (a §3 critical path),
  plus deploy-pipeline infrastructure. The pipeline half alone would be T2;
  the higher tier governs.
Scenarios / acceptance conditions:
  1. A push to main (or a manual dispatch) that passes the existing gates
     publishes the Pages artifact exactly as today AND a root-base build to
     the mirror Worker.
  2. The mirror build's index references /assets/... (root base), inlines
     the same public build-time values as the Pages build (GitHub client
     ID, cert Worker URL, QA API base, Ko-fi URL), and ships no file over
     the Workers 25 MiB per-asset cap (the ONNX asyncify WASM pair stays
     out, via the repo's existing WORKERS_CI mechanism, so Ben on the
     mirror uses the plain WASM build — the historical Workers Builds
     behaviour).
  3. A browser page served from the mirror origin can read the response of
     POST /auth/github/exchange on the cert Worker (CORS allowlist), so
     mirror-origin header sign-in can complete once the mirror build
     carries the client ID. Unlisted origins still get no CORS headers.
  4. If the gates (frontend, worker, e2e) fail, neither surface is
     published — same gating as the Pages deploy today.
Failing tests or test contracts:
  - worker/src/github-exchange-route.test.ts gains a route-level test:
    POST /auth/github/exchange with Origin
    https://systemdesignandarchitecture.knowledgetest.workers.dev must
    carry Access-Control-Allow-Origin for that origin (fails before the
    fix: corsHeaders() returns {}), plus a control test that an unlisted
    origin still receives no Access-Control-Allow-Origin.
  - Local proof builds (not CI tests): root-base build emits /assets/…
    references + the client-ID token in the bundle; Pages-base build
    output unchanged; wrangler config validated by dry-run where the
    sandbox allows, else by parse + schema inspection (labelled).
Scoped files (maximum 3; justify any exception):
  1. .github/workflows/deploy.yml — one new job (deploy-mirror).
  2. wrangler.mirror.toml (new) — assets-only config for the mirror Worker.
  3. worker/src/index.ts — one line: the mirror origin in ALLOWED_ORIGINS.
  Exception (test + records, required by §2/§11, not behaviour):
  worker/src/github-exchange-route.test.ts (failing-first test),
  EVIDENCE_LOG.md (mandatory T1/T2 entry), this manifest.
  Deliberately NOT touched: worker/src/github-oauth.ts (the QA flow has
  its own CORS + PUBLIC_SITE_ORIGIN; out of scope), the SEO generators
  (see Risks), vite.config.ts, package.json scripts, deploy-worker.yml.
Risks / unknowns:
  - SEO origin: the generators (scripts/seo/lesson-meta.mjs siteConfig)
    parametrize only the base path; the origin constant is the canonical
    Pages origin, as in static index.html. With VITE_BASE_PATH=/ the
    mirror's sitemap/feed/llms.txt therefore list root paths on the
    canonical origin. Accepted deliberately: a mirror's generated
    artifacts naming the canonical surface is the correct SEO posture
    (no duplicate-content split), and adding an origin knob would put
    the Pages artifacts — the primary surface — at risk for no
    functional gain. Owner may overrule; the follow-up is one line.
  - The mirror Worker currently has no bindings and was last set by a
    version_upload (2026-10-19 settings); an assets-only wrangler deploy
    preserves the name and replaces the assets. Route/trigger settings
    are untouched by an assets deploy. UNVERIFIED — low confidence until
    the first real pipeline deploy runs (the sandbox cannot deploy).
  - Prerender + snapshot budget hardcode dist/; the mirror job therefore
    builds in its own job (fresh runner) into dist/, never sharing a
    workspace with the Pages build job.
Rejected alternatives and why:
  - One build uploaded to both surfaces: impossible — Pages needs the
    /system-design-and-architecture/ base, the mirror needs / (asset URLs
    are baked in at build time).
  - A second workflow file for the mirror: duplicates the gate jobs or
    drifts from them; one workflow keeps one gate set (workflow
    conventions in this repo: deploy.yml owns site publishing).
  - Deleting the over-cap ort files from dist after a normal build:
    vite.config.ts bakes VITE_ORT_ASYNCIFY from the folder at build
    time, so a post-build delete would leave the runtime asking for a
    file the mirror does not have. WORKERS_CI=1 at build time is the
    repo's own, test-pinned mechanism (scripts/ben/embedder.test.ts).
  - Custom build script / new npm scripts: YAGNI — the existing
    `npm run build` with different env is sufficient.
Token budget (maximum 15,000): noted; the repo cap is recorded here per
  §4, execution is under the parent task's budget.
Approvals / votes / dissent: Owner decision (Liz, 2026-10-28): "Make the
  pipeline publish to both Pages and the mirror (durable fix)". Build
  directed by the parent agent's task brief of 2026-10-28. Full-council
  review seats (A–D) are NOT recorded as convened for this branch; per
  the repo's working precedent the independent review (Reality Checker
  gate) runs at PR stage, before any merge. No PR is opened and nothing
  is merged by this increment.
Chair decision (including any veto): Proceed to branch + evidence only
  (parent tasking, 2026-10-28). PR opening and merging remain the
  owner's word.
```
