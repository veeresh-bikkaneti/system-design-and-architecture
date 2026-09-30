# ADR 0002: Prerendered snapshots are crawler payload — no hydrateRoot

- Status: accepted
- Date: 2026-09-30
- Scope: the SEO prerender pipeline (`scripts/seo/prerender.mjs`, `scripts/seo/check-snapshot-budget.mjs`)

## Context

GitHub Pages serves the course as static files behind React client-side routing. Before
prerendering, the 36 lessons' ~100k words of content were invisible to crawlers: every route
served the same empty `#root` shell. `scripts/seo/prerender.mjs` fixes that by rendering each
indexable route (home, roadmap, badges, 36 lessons) to static `index.html` at build time, each
with its own title, description, canonical URL, OG/Twitter tags, JSON-LD, and the lesson text
as static HTML inside `#root`.

The lesson text is delivered twice: once as the static snapshot (for crawlers and no-JS
readers), once as the client bundle that the app renders. A snapshot is human-tone content
preserved verbatim — the same lesson text the author wrote — which is exactly what the search
results need to see. On boot, `src/main.tsx` uses `createRoot`, which replaces `#root`: the
snapshot is downloaded, then discarded by the client.

Constraints that stay fixed:

- **$0 hosting.** GitHub Pages serves files. There is no SSR server, no edge rendering, no
  build-time cost we won't pay once.
- **No answer-key leakage.** The snapshot is hand-rolled static HTML, never the raw lesson
  source — `<Quiz>` renders its questions and options *without the answer key* (marking correct
  answers in raw HTML would publish it to view-source).

## Decision

**The snapshot is accepted SEO cost, and the client keeps `createRoot`. We deliberately do not
switch to `hydrateRoot` — this is a decision, not an oversight.**

Two independent reasons:

1. **The snapshot is not React SSR output.** It is hand-rolled static HTML from
   `scripts/seo/prerender.mjs`: interactive diagrams render as labeled placeholders
   ("Interactive diagram: X (loads in the app)"), Mermaid diagrams ship as
   `<pre><code class="language-mermaid">` source while the client renders them to SVG, and the
   client renders app chrome the snapshot never has (reading-progress bar, tier hero,
   narrator, "On this page" rail, share buttons, footer). Hydration compares client DOM
   against the snapshot's DOM; these are different trees by design.

2. **The decisive one:** the lesson body is a `React.lazy` MDX chunk rendered behind
   `<Suspense fallback={<p>Loading lesson…</p>}>` (`src/lib/lessons.ts`,
   `src/pages/LessonPage.tsx`). The first client render therefore *never* contains the article
   content — `hydrateRoot` would hit a hydration mismatch on the article subtree on every
   lesson page, every time. React 19's mismatch recovery discards the static HTML and renders
   the fallback anyway: the exact outcome `createRoot` already produces, plus hydration-error
   noise. Hydration here buys nothing and risks subtle breakage. It would need the
   prerenderer to emit byte-identical client DOM (true SSR) to be safe, which is a different
   architecture.

### Measured cost

Measured 2026-09-30 on a build with `VITE_BASE_PATH=/system-design-and-architecture/`
(the same base path the GitHub Pages deploy uses): lesson snapshot **11,216 B min**
(`cap-theorem`) to **38,608 B max** (`designing-chat-at-scale`); **735,330 B total** across
the 36 lessons. Gzip shrinks the worst page to ~16 KB on the wire.

### Growth guard

The cost can't silently grow. `npm run build` runs
`scripts/seo/check-snapshot-budget.mjs` after prerendering:

```
tsc -b && vite build && node scripts/seo/prerender.mjs && node scripts/seo/check-snapshot-budget.mjs
```

The build fails if any route's snapshot exceeds **60 KB** or the 36-lesson total exceeds
**1.2 MB** (~1.6× headroom over the measured numbers). A non-numeric
`SNAPSHOT_BUDGET_PER_PAGE`/`SNAPSHOT_BUDGET_TOTAL` override fails loudly instead of passing
silently (a NaN budget would make every `bytes > budget` comparison false). Raising those
budgets is a deliberate, reviewed act — update the measured numbers in this ADR when you do.

## Consequences

**Better**

- Crawlers and no-JS readers see the full lesson text: 36 lessons of human-tone content,
  titles, and descriptions become indexable.
- The client's first-paint path is unchanged. No hydration-mismatch risk, no hydration-error
  noise, no SSR-shaped build step.

**Costs**

- Every lesson ships its text twice (snapshot + client bundle): the measured bytes above are
  a real, accepted per-navigation download. The 36-lesson total is the SEO bill of the whole
  course, bounded by the guard.
- On the client, the snapshot is discarded on boot — downloaded then thrown away. That is the
  accepted trade for crawler visibility under the $0-hosting constraint.

**Not solved**

- The snapshot is a second rendering of lesson content that must be kept in sync with what
  the client renders; it is generated from the same lesson source at build time, but any
  future client-only content (interactive components, new app chrome) has to be considered
  for whether it belongs in the snapshot too.

## Alternatives rejected

- **`hydrateRoot`:** rejected with proof, above. Hand-rolled snapshot ≠ React SSR output, and
  the lazy lesson body behind `<Suspense>` guarantees a mismatch on every lesson page.
- **True SSR (byte-identical client DOM):** would make hydration safe, but needs a render
  server or edge rendering — violates the $0 static-hosting constraint.
- **No snapshot at all (client-only):** restores the original problem — ~100k lesson words
  invisible to crawlers behind client-side routing.

---

*Note: this decision folds into `docs/architecture.md` §2 when the release branch carrying
that file lands on main. This ADR remains the standalone record.*
