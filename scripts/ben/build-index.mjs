/**
 * Build Ben's semantic index: `public/ben/index.json` (gitignored, rebuilt on
 * every build so it cannot drift from the lessons).
 *
 * Embeds every lesson section and every labelled intent example with the
 * pinned embedder, then stores the vectors as int8 with a per-row scale.
 * The browser decodes them with `src/ai/local/semantic/codec.ts`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../seo/lesson-meta.mjs';
import { chunkAllLessons } from './chunk-lessons.mjs';
import { copyRuntimeAssets, EMBEDDER_DIMS, EMBEDDER_FILES, EMBEDDER_REPO, loadNodeEmbedder } from './embedder.mjs';

export const INDEX_VERSION = 1;
/** Section text kept for the reply and for Qwen's material. The vector sees all of it. */
const TEXT_LIMIT = 700;
const BATCH = 32;

/** Quantize unit vectors to int8 with one float scale per row. */
export function encodeVectors(rows) {
  const dims = rows[0]?.length ?? 0;
  const bytes = new Int8Array(rows.length * dims);
  const scales = [];
  rows.forEach((row, r) => {
    const peak = row.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
    const scale = peak / 127;
    scales.push(Number(scale.toPrecision(7)));
    row.forEach((value, d) => {
      bytes[r * dims + d] = Math.round(value / scale);
    });
  });
  return { data: Buffer.from(bytes.buffer).toString('base64'), scales };
}

async function embedAll(embed, texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await embed(texts.slice(i, i + BATCH))));
  }
  return out;
}

export function loadExemplars() {
  const raw = JSON.parse(readFileSync(join(repoRoot, 'evals', 'ben', 'exemplars.json'), 'utf8'));
  return raw.examples;
}

export async function buildIndex() {
  const embed = await loadNodeEmbedder();
  const chunks = chunkAllLessons();
  const exemplars = loadExemplars();

  // The heading and lesson title travel with the text: "Why this matters" alone means nothing.
  const chunkVectors = await embedAll(
    embed,
    chunks.map((chunk) => `${chunk.title}. ${chunk.heading}. ${chunk.text}`),
  );
  const exemplarVectors = await embedAll(
    embed,
    exemplars.map((example) => example.text),
  );

  const content = createHash('sha256')
    .update(JSON.stringify({ chunks, exemplars, model: EMBEDDER_FILES }))
    .digest('hex')
    .slice(0, 16);

  return {
    version: INDEX_VERSION,
    model: EMBEDDER_REPO,
    dims: EMBEDDER_DIMS,
    content,
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      slug: chunk.slug,
      heading: chunk.heading,
      text: chunk.text.length > TEXT_LIMIT ? `${chunk.text.slice(0, TEXT_LIMIT).replace(/\s+\S*$/, '')}…` : chunk.text,
    })),
    chunkVectors: encodeVectors(chunkVectors),
    intents: exemplars.map((example) => example.intent),
    intentVectors: encodeVectors(exemplarVectors),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = Date.now();
  // `--optional` (used by `npm run dev`): an offline machine still gets a dev
  // server, and Ben falls back to keyword routing. Builds never pass it.
  const optional = process.argv.includes('--optional');
  let index;
  try {
    index = await buildIndex();
  } catch (error) {
    if (!optional) throw error;
    console.warn(`ben: index skipped (${error instanceof Error ? error.message : error}); Ben will use keyword routing.`);
    process.exit(0);
  }
  copyRuntimeAssets();
  const dir = join(repoRoot, 'public', 'ben');
  mkdirSync(dir, { recursive: true });
  const json = JSON.stringify(index);
  writeFileSync(join(dir, 'index.json'), json);
  console.log(
    `ben: index ${index.content} — ${index.chunks.length} lesson sections, ` +
      `${index.intents.length} intent examples, ${(json.length / 1024).toFixed(0)} KB, ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}
