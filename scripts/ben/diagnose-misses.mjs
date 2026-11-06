// Read-only diagnostic: for every miss in the pooled eval run, print why the router decided as it did.
// Run: node scripts/ben/diagnose-misses.mjs [--json]   (needs the model: `npm run ben:index` fetches it)
import { readFileSync } from 'node:fs';
import { buildIndex } from './build-index.mjs';
import { loadNodeEmbedder } from './embedder.mjs';
import { decodeIndex, dot } from '../../src/ai/local/semantic/codec.ts';
import { queryText, route, THRESHOLDS } from '../../src/ai/local/semantic/router.ts';

const read = (f, set) => JSON.parse(readFileSync(new URL(`../../evals/ben/${f}`, import.meta.url), 'utf8')).cases.map((c) => ({ ...c, set }));
const cases = [...read('cases.json', 'cases'), ...read('holdout.json', 'holdout')];
const bank = JSON.parse(readFileSync(new URL('../../evals/ben/exemplars.json', import.meta.url), 'utf8')).examples;

const embed = await loadNodeEmbedder();
const index = decodeIndex(JSON.parse(JSON.stringify(await buildIndex())));
const f = (n) => n.toFixed(2);

const counts = {};
for (const e of bank) counts[e.intent] = (counts[e.intent] ?? 0) + 1;
const out = [`exemplar bank: ${JSON.stringify(counts)} (total ${bank.length}); thresholds ${JSON.stringify(THRESHOLDS)}`];

// Which branch of router.ts fired, reconstructed from the Decision (reasons[0] is set by each branch).
const branch = (d) => d.reasons[0];

for (const c of cases) {
  const vector = Float32Array.from((await embed([queryText(c.q, c.history ?? [])]))[0]);
  const d = route({ question: c.q, focusId: c.focus, vector, index });
  const ok = new Set([c.action, ...(c.alsoOk ?? [])]);
  const correct = ok.has(d.action) && !(d.action === 'lesson' && c.lessons && !c.lessons.includes(d.lessons[0]?.slug));
  if (correct) continue;
  const near = index.examples.map((e, i) => ({ i, s: dot(vector, e.vector) })).sort((a, b) => b.s - a.s);
  const votes = near.slice(0, THRESHOLDS.k).map((n) => `${bank[n.i].intent}:${f(n.s)}`).join(' ');
  out.push(
    '',
    `### ${c.id} [${c.set}] expected ${c.action}${c.lessons?.length ? ` (${c.lessons.join('|')})` : ''} -> got ${d.action}`,
    `q: ${c.q}`,
    `vote: ${d.intent} ${f(d.intentConfidence)}  dist ${Object.entries(d.intentScores).map(([k, v]) => `${k}=${f(v)}`).join(' ')}`,
    `k=7 neighbours: ${votes}`,
    `topScore(best section) ${f(d.lessons[0]?.best ?? 0)}; top2 ${d.lessons.slice(0, 2).map((l) => `${l.slug} best=${f(l.best)} score=${f(l.score)}`).join(', ')}`,
    `branch: ${branch(d)}${d.pinned ? ` pinned=${d.pinned}` : ''}`,
    `3 nearest exemplars: ${near.slice(0, 3).map((n) => `[${bank[n.i].intent} ${f(n.s)}] ${bank[n.i].text}`).join(' | ')}`,
  );
}
console.log(out.join('\n'));
