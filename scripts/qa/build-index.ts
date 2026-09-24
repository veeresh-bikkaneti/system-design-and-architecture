// P1 (course Q&A agent): build-time lesson retrieval index.
//
// Reads content/lessons/*.mdx, chunks each lesson, and emits
// worker/src/qa/qa-index.ts: a bundled keyword index of per-term top-N
// BM25 postings (integer scores) + chunk metadata/excerpts. This is what
// the Worker ranks against at request time -- no database of any kind (see
// worker/README.md's "Anonymous Session architecture"). Full chunk text
// never leaves this build step: only short excerpts are bundled, and there
// is no read_lesson tool to serve the rest.
//
// Run: `npm run qa:index` (also wired into `prebuild`).
//
// Quiz exclusion (security-critical): the ENTIRE <Quiz> JSX block --
// questions, options, and correctIndex -- is stripped before chunking, so
// quiz answer keys can never leak into the index. Verified by tests.
//
// Executed by node with type stripping (node >= 22); shares the tokenizer
// with the Worker via worker/src/qa/retrieval.ts -- single source of truth.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tokenize,
  type QaChunkMeta,
  type QaIndexData,
  type QaTermPostings,
} from '../../worker/src/qa/retrieval.ts';
// Full lesson metadata (tier/order/summary/topics) -- single source of truth
// shared with the SEO scripts. Validated by extractMeta.
import { extractMeta } from '../seo/lesson-meta.mjs';

const MAX_CHUNK_WORDS = 400;
const EXCERPT_CHARS = 180;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const POSTINGS_PER_TERM = 8;
/** Cap on the serialized terms map so the Worker bundle stays lean. */
const TERMS_BYTE_BUDGET = 400_000;
/** Sections that are bibliography/link lists, not lesson prose. */
const DROPPED_SECTIONS = new Set(['go deeper', 'sources & further reading', 'further reading']);

interface LessonChunk {
  id: number;
  slug: string;
  title: string;
  heading: string;
  ordinal: number;
  text: string;
}

interface LessonInput {
  slug: string;
  title: string;
  mdx: string;
}

/** Full lesson input for the P2 metadata artifact (curriculum + videos). */
export interface LessonMetaInput extends LessonInput {
  tier: 'beginner' | 'intermediate' | 'advanced';
  order: number;
  summary: string;
  topics: string[];
}

/** One <VideoCard> embedded in a lesson, tagged with its lesson. */
export interface QaVideoMeta {
  /** Lesson slug the video is embedded in. */
  slug: string;
  lessonTitle: string;
  videoId: string;
  title: string;
  source: string;
  description: string;
}

/**
 * Extract every <VideoCard .../> in a lesson. Quote-aware tag scan (the
 * shared scanTagEnd) so `>` inside a quoted prop can't end the match early.
 * Lessons carry no quiz content here -- video metadata only.
 */
export function extractVideos(mdx: string): Omit<QaVideoMeta, 'slug' | 'lessonTitle'>[] {
  const videos: Omit<QaVideoMeta, 'slug' | 'lessonTitle'>[] = [];
  let i = 0;
  for (;;) {
    const start = mdx.indexOf('<VideoCard', i);
    if (start === -1) break;
    const tagEnd = scanTagEnd(mdx, start + '<VideoCard'.length);
    if (tagEnd === -1) {
      i = start + 1;
      continue;
    }
    const tag = mdx.slice(start, tagEnd + 1);
    const prop = (name: string): string => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? '';
    const videoId = prop('videoId');
    const title = prop('title');
    if (videoId.length > 0 && title.length > 0) {
      videos.push({ videoId, title, source: prop('source'), description: prop('description') });
    }
    i = tagEnd + 1;
  }
  return videos;
}

export interface QaMetaData {
  version: 1;
  generatedAt: string;
  /** Syllabus order (by `order`). */
  curriculum: Array<{
    slug: string;
    title: string;
    tier: string;
    order: number;
    summary: string;
    topics: string[];
  }>;
  videos: QaVideoMeta[];
}

/** Pure build of the P2 metadata artifact: curriculum + video catalog. */
export function buildQaMetaData(lessons: LessonMetaInput[], generatedAt: string): QaMetaData {
  const curriculum = [...lessons]
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      slug: l.slug,
      title: l.title,
      tier: l.tier,
      order: l.order,
      summary: l.summary,
      topics: l.topics,
    }));
  const videos: QaVideoMeta[] = [];
  for (const lesson of lessons) {
    for (const v of extractVideos(lesson.mdx)) {
      videos.push({ slug: lesson.slug, lessonTitle: lesson.title, ...v });
    }
  }
  return { version: 1, generatedAt, curriculum, videos };
}

/**
 * Remove one JSX component starting at `lt` (index of '<'). Returns the
 * index just past the removed component. Handles self-closing tags and
 * paired open/close tags with nesting; brace- and quote-aware so `>` inside
 * props (e.g. `nodes={[...]}`) does not end the scan early.
 */
function skipComponent(src: string, name: string, openEnd: number): number {
  const selfClosing = src[openEnd - 1] === '/';
  let i = openEnd + 1;
  if (selfClosing) return i;
  const closeTag = `</${name}>`;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const nextOpen = src.indexOf(`<${name}`, i);
    const nextClose = src.indexOf(closeTag, i);
    if (nextClose === -1) return src.length; // unbalanced: drop the rest
    const openIsReal =
      nextOpen !== -1 &&
      nextOpen < nextClose &&
      !/[A-Za-z0-9]/.test(src[nextOpen + name.length + 1] ?? '');
    if (openIsReal) {
      // Skip past this nested opening tag's own end.
      const nestedEnd = scanTagEnd(src, nextOpen + name.length + 1);
      depth += 1;
      i = nestedEnd === -1 ? src.length : nestedEnd + 1;
    } else {
      depth -= 1;
      i = nextClose + closeTag.length;
    }
  }
  return i;
}

/** Scan from `from` to the `>` that terminates a tag (brace/quote aware). -1 if none. */
function scanTagEnd(src: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let j = from; j < src.length; j++) {
    const ch = src[j] as string;
    if (quote !== null) {
      if (ch === '\\') {
        j += 1;
      } else if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
    } else if (ch === '>' && depth === 0) {
      return j;
    }
  }
  return -1;
}

/** Strip every JSX component (<Quiz>, <VideoCard>, <StepThrough>, ...) from MDX. */
function stripJsxComponents(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      out += src.slice(i);
      break;
    }
    const tagMatch = /^<([A-Z][A-Za-z0-9]*)/.exec(src.slice(lt, lt + 64));
    if (!tagMatch?.[1]) {
      out += src.slice(i, lt + 1);
      i = lt + 1;
      continue;
    }
    const name = tagMatch[1];
    const tagEnd = scanTagEnd(src, lt + tagMatch[0].length);
    if (tagEnd === -1) {
      // Malformed tag: keep scanning past the '<' so we never loop forever.
      out += src.slice(i, lt + 1);
      i = lt + 1;
      continue;
    }
    out += src.slice(i, lt);
    i = skipComponent(src, name, tagEnd);
  }
  return out;
}

/**
 * Strip non-prose from a lesson: the meta export, all JSX components (this
 * is what removes the entire <Quiz> block -- questions, options, and
 * correctIndex alike), mermaid diagram sources, and code-fence markers
 * (other code blocks keep their text).
 */
export function stripMdx(raw: string): string {
  let src = raw.replace(/^export const meta = \{[\s\S]*?\n\};[ \t]*\r?\n?/m, '');
  src = stripJsxComponents(src);
  src = src.replace(/```mermaid[\s\S]*?```/g, '');
  src = src.replace(/```[^\n]*\n([\s\S]*?)```/g, '$1');
  src = src.replace(/<!--[\s\S]*?-->/g, '');
  return src;
}

function wordCount(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}

/** Split a section's prose into ~MAX_CHUNK_WORDS chunks at paragraph boundaries. */
export function chunkSection(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0 && p !== '---');
  const chunks: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current.trim().length > 0) chunks.push(current.trim());
    current = '';
  };
  for (const para of paragraphs) {
    if (wordCount(para) > MAX_CHUNK_WORDS) {
      // One giant paragraph: split on sentence boundaries.
      flush();
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if (current.length > 0 && wordCount(current + ' ' + s) > MAX_CHUNK_WORDS) flush();
        current = current.length > 0 ? current + ' ' + s : s;
      }
      continue;
    }
    if (current.length > 0 && wordCount(current + ' ' + para) > MAX_CHUNK_WORDS) flush();
    current = current.length > 0 ? current + '\n\n' + para : para;
  }
  flush();
  return chunks;
}

function excerptFor(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= EXCERPT_CHARS ? flat : flat.slice(0, EXCERPT_CHARS).trimEnd() + '…';
}

interface BuiltIndex {
  chunks: LessonChunk[];
  indexData: QaIndexData;
}

/** Pure build: lessons in, chunks + bundled index out. */
export function buildIndexFromLessons(lessons: LessonInput[], generatedAt: string): BuiltIndex {
  const chunks: LessonChunk[] = [];
  let nextId = 0;
  for (const lesson of lessons) {
    const stripped = stripMdx(lesson.mdx);
    // Split into ## sections; text before the first heading becomes Overview.
    const sections: Array<{ heading: string; text: string }> = [];
    const parts = stripped.split(/^## /m);
    const preamble = (parts[0] ?? '').trim();
    if (preamble.length > 0) sections.push({ heading: 'Overview', text: preamble });
    for (const part of parts.slice(1)) {
      const nl = part.indexOf('\n');
      const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
      const text = (nl === -1 ? '' : part.slice(nl + 1)).trim();
      if (DROPPED_SECTIONS.has(heading.toLowerCase())) continue;
      if (text.length === 0) continue;
      sections.push({ heading, text });
    }
    let ordinal = 0;
    for (const section of sections) {
      for (const text of chunkSection(section.text)) {
        chunks.push({
          id: nextId++,
          slug: lesson.slug,
          title: lesson.title,
          heading: section.heading,
          ordinal: ordinal++,
          text,
        });
      }
    }
  }

  // BM25 over title/heading-boosted chunk text.
  const N = chunks.length;
  const docTfs: Array<Map<string, number>> = [];
  const docLens: number[] = [];
  const df = new Map<string, number>();
  for (const chunk of chunks) {
    const boosted = `${chunk.title} ${chunk.heading} ${chunk.title} ${chunk.heading} ${chunk.text}`;
    const tokens = tokenize(boosted);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    docTfs.push(tf);
    docLens.push(tokens.length);
  }
  const avgdl = docLens.reduce((a, b) => a + b, 0) / Math.max(N, 1);

  // Per-term top-N postings, with a byte budget on the serialized terms map.
  const termScores = new Map<string, Array<[number, number]>>();
  for (const [term, dfv] of df) {
    const idf = Math.log(1 + (N - dfv + 0.5) / (dfv + 0.5));
    const scored: Array<[number, number]> = [];
    for (let ci = 0; ci < N; ci++) {
      const tf = docTfs[ci]?.get(term) ?? 0;
      if (tf === 0) continue;
      const dl = docLens[ci] as number;
      const score =
        (idf * (tf * (BM25_K1 + 1))) / (tf + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / avgdl));
      scored.push([ci, Math.round(score * 1000)]);
    }
    scored.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    termScores.set(term, scored.slice(0, POSTINGS_PER_TERM));
  }

  // Priority: terms in 2+ chunks first (most discriminative per byte is
  // debatable, but df>=2 terms carry the topical vocabulary), then rare
  // terms longest-first. Greedy fill to the byte budget; deterministic.
  const ordered = [...termScores.keys()].sort((a, b) => {
    const da = df.get(a) as number;
    const db = df.get(b) as number;
    const pa = da >= 2 ? 0 : 1;
    const pb = db >= 2 ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (b.length !== a.length) return b.length - a.length;
    return a < b ? -1 : 1;
  });
  const terms: Record<string, QaTermPostings> = {};
  let bytes = 2; // "{}"
  let dropped = 0;
  for (const term of ordered) {
    const postings = termScores.get(term) as Array<[number, number]>;
    const entry: QaTermPostings = { df: df.get(term) as number, postings };
    const entryJson = JSON.stringify(entry);
    const cost = term.length + entryJson.length + 4; // quotes, colon, comma
    if (bytes + cost > TERMS_BYTE_BUDGET) {
      dropped += 1;
      continue;
    }
    terms[term] = entry;
    bytes += cost;
  }

  const metas: QaChunkMeta[] = chunks.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    heading: c.heading,
    ordinal: c.ordinal,
    excerpt: excerptFor(c.text),
  }));
  const indexData: QaIndexData = {
    version: 1,
    generatedAt,
    chunkCount: chunks.length,
    terms,
    chunks: metas,
  };

  // eslint-disable-next-line no-console
  if (dropped > 0) console.log(`qa:index: dropped ${dropped} terms over the byte budget`);

  return { chunks, indexData };
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const lessonsDir = join(root, 'content', 'lessons');
  const files = readdirSync(lessonsDir)
    .filter((f) => f.endsWith('.mdx'))
    .sort();
  if (files.length === 0) throw new Error(`qa:index: no lessons found in ${lessonsDir}`);

  const lessons: LessonMetaInput[] = files.map((file) => {
    const mdx = readFileSync(join(lessonsDir, file), 'utf8');
    const meta = extractMeta(mdx, file) as {
      slug: string;
      title: string;
      tier: 'beginner' | 'intermediate' | 'advanced';
      order: number;
      summary: string;
      topics?: string[];
    };
    return {
      slug: meta.slug,
      title: meta.title,
      tier: meta.tier,
      order: meta.order,
      summary: meta.summary,
      topics: meta.topics ?? [],
      mdx,
    };
  });

  const generatedAt = new Date().toISOString();
  const { chunks, indexData } = buildIndexFromLessons(lessons, generatedAt);
  const metaData = buildQaMetaData(lessons, generatedAt);

  const header = `// GENERATED by scripts/qa/build-index.ts -- do not edit by hand.\n// Lesson retrieval index for the course Q&A agent (P1).\n// Quiz blocks are stripped before chunking: no answer keys in this file.\n// Regenerate with: npm run qa:index\nimport type { QaIndexData } from './retrieval';\n\nexport const QA_INDEX: QaIndexData = `;
  const indexPath = join(root, 'worker', 'src', 'qa', 'qa-index.ts');
  writeFileSync(indexPath, header + JSON.stringify(indexData) + '\n');

  const metaHeader =
    `// GENERATED by scripts/qa/build-index.ts -- do not edit by hand.\n` +
    `// Curriculum + video catalog for the course Q&A agent's list_curriculum\n` +
    `// and find_video tools (P2). Lesson metadata and <VideoCard> props only;\n` +
    `// quiz blocks never enter this file.\n` +
    `// Regenerate with: npm run qa:index\n\n` +
    `export interface QaCurriculumLesson {\n` +
    `  slug: string;\n` +
    `  title: string;\n` +
    `  tier: string;\n` +
    `  order: number;\n` +
    `  summary: string;\n` +
    `  topics: string[];\n` +
    `}\n\n` +
    `export interface QaVideoMeta {\n` +
    `  /** Lesson slug the video is embedded in. */\n` +
    `  slug: string;\n` +
    `  lessonTitle: string;\n` +
    `  videoId: string;\n` +
    `  title: string;\n` +
    `  source: string;\n` +
    `  description: string;\n` +
    `}\n\n` +
    `export interface QaMetaData {\n` +
    `  version: 1;\n` +
    `  generatedAt: string;\n` +
    `  /** Syllabus order (by lesson order). */\n` +
    `  curriculum: QaCurriculumLesson[];\n` +
    `  videos: QaVideoMeta[];\n` +
    `}\n\n` +
    `export const QA_META: QaMetaData = `;
  const metaPath = join(root, 'worker', 'src', 'qa', 'qa-meta.ts');
  writeFileSync(metaPath, metaHeader + JSON.stringify(metaData) + '\n');

  const indexBytes = Buffer.byteLength(header + JSON.stringify(indexData));
  const words = chunks.reduce((a, c) => a + wordCount(c.text), 0);
  // eslint-disable-next-line no-console
  console.log(
    `qa:index: ${lessons.length} lessons -> ${chunks.length} chunks (${words} words), ` +
      `${Object.keys(indexData.terms).length} terms, ` +
      `index ${(indexBytes / 1024).toFixed(0)}KB`,
  );
}

const invokedAsScript =
  typeof process.argv[1] === 'string' && process.argv[1].endsWith('build-index.ts');
if (invokedAsScript) main();
