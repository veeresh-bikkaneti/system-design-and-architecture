# System Design Mastery

A static, progressive System Design course that runs entirely in the browser — no backend,
deployable straight to GitHub Pages. Lessons are written in MDX, progress is tracked in
`localStorage`, and an optional **Bring Your Own Key (BYOK)** AI tutor (wired directly from the
client to the LLM provider of your choice) can chat about the material and sketch architecture
diagrams as Mermaid.js flowcharts.

The AI tutor is strictly additive: every lesson, quiz, and progress feature works with zero API
key configured.

## Curriculum

Lesson content is adapted and reorganized from the topic outline in
[puncsky/system-design-and-architecture](https://github.com/puncsky/system-design-and-architecture),
rewritten here as original text with citations rather than reproduced verbatim.

## Stack

- Vite + React + TypeScript, built with `vite build` (static export, no SSR/backend)
- Tailwind CSS v4
- MDX (`@mdx-js/rollup`) for lesson content in `/content/lessons`
- `react-router-dom` (`HashRouter`, so it works unmodified on GitHub Pages)
- Zustand + `localStorage` for progress/quiz state
- `mermaid` for rendering AI-generated architecture diagrams

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # static production build -> dist/
npm run preview  # serve the production build locally
```

## Deploying to GitHub Pages

`npm run build` outputs a fully static site to `dist/`. Point GitHub Pages (or the included
GitHub Actions workflow, if configured) at that directory. Because the app uses `HashRouter`,
no server-side rewrite rules are needed for client-side routes to work on Pages.
