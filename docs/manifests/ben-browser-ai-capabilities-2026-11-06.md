# T3 manifest — Ben browser-AI capability note

**Task:** Document current browser-local model/API capabilities relevant to Ben in Chrome, Microsoft Edge, and Firefox, with primary-source citations and clear separation between browser UI features and website-callable APIs.

**Risk tier:** T3 — docs-only, bounded research note; no runtime or product behavior changes. The owner’s request to continue this task authorizes this narrow documentation scope.

**Scoped files:** `docs/ben-browser-ai-capabilities.md` and this manifest. No source code, model, API dependency, privacy-policy, or deployment changes.

**Acceptance:** Use primary Mozilla, Microsoft, Chrome, and Chromium sources checked 2026-11-06; state the documented API maturity, model/hardware constraints, and local-first implications; explicitly qualify the Firefox finding to the sources reviewed; do not imply that browser-local inference automatically supplies citations, tool calling, web scraping, or strong reasoning. Keep cloud inference, paid API, and VM paths out of scope.

**Failing tests / verification:** No behavioral test applies to a docs-only change. Run `git diff --check` and check all cited sources and statements against their pages before commit.

**Risks / unknowns:** Browser support and model gates can change; no live cross-browser runtime test was performed. The note is a dated documentation snapshot, not a compatibility guarantee or a runtime implementation plan.

**Decision:** Direct T3 execution under `AGENTS.md` §3; open a draft PR for owner review, do not merge.
