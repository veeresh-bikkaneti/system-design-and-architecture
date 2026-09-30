/**
 * Fail the build if the prerendered SEO snapshot grows past its budget.
 *
 * Context (see docs/adr/0002-prerender-snapshot-no-hydration.md): every
 * prerendered route ships its lesson text as static HTML inside `#root`
 * (~11–38 KB per lesson page, measured 2026-09-30). On boot the SPA's
 * `createRoot` discards it — it is crawler/no-JS payload, not a hydration
 * target. That is a deliberate, accepted SEO cost, but nothing stops the
 * snapshot from silently ballooning as lessons grow (the interview-canon
 * case-study lessons will be longer than today's). This check is the
 * backstop: it runs at the end of `npm run build`, after
 * `scripts/seo/prerender.mjs`, and fails loudly on budget overrun so the
 * growth gets a deliberate review instead of slipping into a deploy.
 *
 * Budgets are UTF-8 bytes of the `<!--prerender-body-->…<!--/prerender-body-->`
 * payload (the crawler-only HTML, not the page shell). Override for
 * experiments with SNAPSHOT_BUDGET_PER_PAGE / SNAPSHOT_BUDGET_TOTAL
 * (plain byte counts).
 *
 * Exits 0 on pass, 1 on any overrun or missing snapshot.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './lesson-meta.mjs';

/* Budgets — see the header comment for the rationale. Raise them only as
 * a deliberate, reviewed act (and update docs/architecture.md's measured
 * numbers when you do). */
const PER_PAGE_BUDGET = Number(process.env.SNAPSHOT_BUDGET_PER_PAGE ?? 60_000);
const TOTAL_BUDGET = Number(process.env.SNAPSHOT_BUDGET_TOTAL ?? 1_200_000);

// A non-numeric override would silently become NaN and every `bytes > NaN`
// comparison is false, so the guard would pass everything. Fail loudly.
for (const [name, value] of [
  ['SNAPSHOT_BUDGET_PER_PAGE', PER_PAGE_BUDGET],
  ['SNAPSHOT_BUDGET_TOTAL', TOTAL_BUDGET],
]) {
  if (!Number.isFinite(value)) {
    console.error(
      `snapshot-budget FAIL: ${name} must be a plain byte count, ` +
        `got "${process.env[name]}" — refusing to run with an unparseable budget`,
    );
    process.exit(1);
  }
}

const BODY_RE = /<!--prerender-body-->([\s\S]*?)<!--\/prerender-body-->/;
const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;

function snapshotBytes(outPath) {
  const abs = join(repoRoot, 'dist', outPath);
  if (!existsSync(abs)) {
    throw new Error(
      `snapshot-budget: dist/${outPath} missing — run \`vite build\` + prerender first`,
    );
  }
  const html = readFileSync(abs, 'utf8');
  const m = html.match(BODY_RE);
  if (!m) {
    throw new Error(
      `snapshot-budget: dist/${outPath} has no prerender-body sentinel — ` +
        'prerender.mjs may have failed or the template changed',
    );
  }
  return Buffer.byteLength(m[1], 'utf8');
}

const lessonSlugs = readdirSync(join(repoRoot, 'dist', 'lesson'), {
  withFileTypes: true,
})
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const routes = [
  { label: '(home)', out: 'index.html' },
  { label: '(roadmap)', out: 'roadmap/index.html' },
  { label: '(badges)', out: 'badges/index.html' },
  ...lessonSlugs.map((slug) => ({ label: slug, out: `lesson/${slug}/index.html` })),
];

const results = routes.map((r) => ({ ...r, bytes: snapshotBytes(r.out) }));
const lessonResults = results.filter((r) => !r.label.startsWith('('));
const lessonTotal = lessonResults.reduce((sum, r) => sum + r.bytes, 0);

const overPage = results.filter((r) => r.bytes > PER_PAGE_BUDGET);

console.log('snapshot-budget: per-page budget', fmt(PER_PAGE_BUDGET), '| total budget', fmt(TOTAL_BUDGET));
const widest = results.reduce((w, r) => Math.max(w, r.label.length), 0);
for (const r of [...results].sort((a, b) => b.bytes - a.bytes).slice(0, 5)) {
  console.log(`  max  ${r.label.padEnd(widest)} ${fmt(r.bytes)}`);
}
console.log(`  lessons total (${lessonResults.length} pages): ${fmt(lessonTotal)}`);

let failed = false;
for (const r of overPage) {
  console.error(
    `snapshot-budget FAIL: ${r.label} snapshot is ${fmt(r.bytes)} — exceeds per-page budget ${fmt(PER_PAGE_BUDGET)}`,
  );
  failed = true;
}
if (lessonTotal > TOTAL_BUDGET) {
  console.error(
    `snapshot-budget FAIL: lesson snapshot total is ${fmt(lessonTotal)} — exceeds total budget ${fmt(TOTAL_BUDGET)}`,
  );
  failed = true;
}
if (failed) {
  console.error(
    'snapshot-budget: budgets are deliberate — shrinking lesson content, ' +
      'trimming the static snapshot in scripts/seo/prerender.mjs, or raising the ' +
      'budgets with a reviewed architecture.md update are the three ways out.',
  );
  process.exit(1);
}
console.log('snapshot-budget: OK');
