// scratch harness only: route probe phrasings through origin/main's router and the patched one.
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildIndex } from '../../scripts/ben/build-index.mjs';
import { loadNodeEmbedder } from '../../scripts/ben/embedder.mjs';
import { decodeIndex, type RawBenIndex } from '../../src/ai/local/semantic/codec.ts';
import { queryText, route } from '../../src/ai/local/semantic/router.ts';
import { route as routeMain } from '../../src/ai/local/semantic/router_main.ts';

const history = [
  { role: 'user' as const, content: 'what is caching' },
  { role: 'assistant' as const, content: 'Caching keeps hot data close to where it is read.' },
];

it('probes', async () => {
  const embed = await loadNodeEmbedder();
  const index = decodeIndex(JSON.parse(JSON.stringify(await buildIndex())) as RawBenIndex);
  const rows = readFileSync(process.env.PROBES as string, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('|').map((s) => s.trim()));
  const out: string[] = [];
  for (const r of rows) {
    const cls = r[0].replace(/^CHANGED\s*/, '') || r[1];
    const [klass, q] = r[0] === '' || r[0] === 'CHANGED' ? [r[1], r[2]] : [r[0], r[1]];
    const h = klass === 'follow' ? history : [];
    const [v] = await embed([queryText(q, h)]);
    const vector = Float32Array.from(v);
    const a = routeMain({ question: q, vector, index });
    const b = route({ question: q, vector, index });
    const same = a.action === b.action && a.lessons[0]?.slug === b.lessons[0]?.slug;
    out.push([same ? '       ' : 'CHANGED', klass, q, a.action, '->', b.action, b.intent, b.intentConfidence.toFixed(3), (b.lessons[0]?.best ?? 0).toFixed(4), b.lessons[0]?.slug, b.reasons[0]].join(' | '));
    void cls;
  }
  writeFileSync(process.env.PROBE_OUT as string, out.join('\n') + '\n');
}, 900_000);
