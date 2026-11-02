// scratch only
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildIndex } from '../../scripts/ben/build-index.mjs';
import { loadNodeEmbedder } from '../../scripts/ben/embedder.mjs';
import { decodeIndex, type RawBenIndex } from '../../src/ai/local/semantic/codec.ts';
import { queryText, route } from '../../src/ai/local/semantic/router.ts';

const history = [
  { role: 'user' as const, content: 'what is caching' },
  { role: 'assistant' as const, content: 'Caching keeps hot data close to where it is read.' },
];
it('probes', async () => {
  const embed = await loadNodeEmbedder();
  const index = decodeIndex(JSON.parse(JSON.stringify(await buildIndex())) as RawBenIndex);
  const rows = readFileSync(process.env.PROBES as string, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('|').map((s) => s.trim()));
  const out: string[] = [];
  for (const [klass, q] of rows) {
    const [v] = await embed([queryText(q, klass === 'follow' ? history : [])]);
    const d = route({ question: q, vector: Float32Array.from(v), index, history: klass === 'follow' ? history : undefined } as never);
    out.push([klass, q, d.action, d.intent, d.intentConfidence.toFixed(3), (d.lessons[0]?.best ?? 0).toFixed(3), d.lessons[0]?.slug].join(' | '));
  }
  writeFileSync(process.env.PROBE_OUT as string, out.join('\n') + '\n');
}, 900_000);
