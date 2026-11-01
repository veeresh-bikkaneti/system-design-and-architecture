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
import { chunkAllLessons, isFragment, splitSentences } from './chunk-lessons.mjs';
import { copyRuntimeAssets, EMBEDDER_DIMS, EMBEDDER_FILES, EMBEDDER_REPO, loadNodeEmbedder } from './embedder.mjs';
import { isMainModule } from './is-main.mjs';

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

/**
 * Trim section text to TEXT_LIMIT characters at a sentence boundary. If the
 * very first sentence is already longer, keep it whole and say so: a long
 * sentence beats half a sentence.
 */
export function shippedText(chunk) {
  if (chunk.text.length <= TEXT_LIMIT) return chunk.text;
  const kept = [];
  let length = 0;
  for (const sentence of splitSentences(chunk.text)) {
    if (kept.length > 0 && length + 1 + sentence.length > TEXT_LIMIT) break;
    kept.push(sentence);
    length += (kept.length > 1 ? 1 : 0) + sentence.length;
  }
  if (length > TEXT_LIMIT) console.warn(`ben: ${chunk.id} keeps one ${length}-char sentence past the ${TEXT_LIMIT}-char limit`);
  return kept.join(' ');
}

/** Fail the build if any shipped section starts or stops mid-sentence. */
export function assertNoFragments(chunks) {
  const bad = chunks.filter((chunk) => isFragment(chunk.text)).map((chunk) => chunk.id);
  if (bad.length > 0) {
    throw new Error(
      `ben: ${bad.length} lesson section(s) start or stop mid-sentence: ${bad.join(', ')}. ` +
        'Fix the chunker (scripts/ben/chunk-lessons.mjs) or the lesson prose.',
    );
  }
}

export async function buildIndex() {
  const chunks = chunkAllLessons();
  // Gate the text Ben actually shows, after trimming, not the pre-trim original.
  const shipped = chunks.map((chunk) => ({ ...chunk, text: shippedText(chunk) }));
  assertNoFragments([...chunks, ...shipped]);
  const embed = await loadNodeEmbedder();
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
    chunks: shipped.map((chunk) => ({
      id: chunk.id,
      slug: chunk.slug,
      heading: chunk.heading,
      text: chunk.text,
    })),
    chunkVectors: encodeVectors(chunkVectors),
    intents: exemplars.map((example) => example.intent),
    intentVectors: encodeVectors(exemplarVectors),
  };
}

if (isMainModule(import.meta.url)) {
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
