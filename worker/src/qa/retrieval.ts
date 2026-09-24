// P1 (course Q&A agent): shared retrieval primitives.
//
// This module is intentionally dependency-free: it is imported by the
// Cloudflare Worker at runtime AND by the build-time index generator
// (scripts/qa/build-index.ts, executed by node with type stripping), so it
// must not touch Workers APIs, node APIs, or any npm package. Keep it that
// way.
//
// Search model: deterministic keyword search over a build-time BM25 index.
// The generator precomputes, per query term, the top-N chunks by BM25 score
// (scores stored as integers, BM25 x 1000). At query time we tokenize the
// query with the SAME tokenizer, look up each term's posting list, and sum
// scores. No embeddings, no Vectorize, no D1 round-trip for ranking -- the
// full chunk texts live in D1 (qa_chunks, seeded by a generated migration)
// for P2's read_lesson tool, while ranking metadata + excerpts ship in the
// Worker bundle.

/** Ranking metadata + excerpt for one retrievable chunk. Bundled. */
export interface QaChunkMeta {
  /** Stable chunk id; also the primary key in the D1 qa_chunks table. */
  id: number;
  slug: string;
  title: string;
  /** The `##` section heading this chunk came from. */
  heading: string;
  /** Chunk ordinal within its lesson. */
  ordinal: number;
  /** Short text snippet for search results (never a quiz answer). */
  excerpt: string;
}

/** Precomputed BM25 postings for one term: [chunkId, score] sorted by score desc. */
export interface QaTermPostings {
  /** Number of chunks containing the term. */
  df: number;
  postings: Array<[number, number]>;
}

/** The generated artifact (worker/src/qa/qa-index.ts). Versioned contract. */
export interface QaIndexData {
  version: 1;
  generatedAt: string;
  chunkCount: number;
  terms: Record<string, QaTermPostings>;
  chunks: QaChunkMeta[];
}

export interface QaSearchResult {
  chunkId: number;
  slug: string;
  title: string;
  heading: string;
  ordinal: number;
  excerpt: string;
  /** Summed integer BM25 score across matched query terms. */
  score: number;
}

/**
 * Minimal D1 surface the chunk store needs. Declared structurally (instead
 * of referencing the global D1Database type) so this module also compiles
 * under plain node typings for the build script.
 */
export interface D1Like {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      all<T>(): Promise<{ results: T[] }>;
    };
  };
}

/** Source of full chunk texts (D1 in production, in-memory in tests). */
export interface ChunkStore {
  /** Full texts for a lesson slug, in any order (caller sorts by ordinal). */
  getLessonChunks(slug: string): Promise<Array<{ ordinal: number; text: string }>>;
}

// Compact English stopword list. Kept small on purpose: dropping these
// shrinks the bundled index without hurting course-topic queries.
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'this',
  'that', 'these', 'those', 'you', 'your', 'yours', 'we', 'our', 'they', 'their',
  'he', 'she', 'him', 'her', 'at', 'by', 'from', 'into', 'about', 'over',
  'under', 'between', 'through', 'during', 'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'not', 'no', 'nor', 'so', 'such', 'than',
  'then', 'too', 'very', 'can', 'will', 'just', 'should', 'would', 'could',
  'there', 'what', 'when', 'where', 'which', 'who', 'whom', 'how', 'why',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'only', 'own', 'same', 'if', 'because', 'while', 'until', 'per', 'via',
  'also', 'like',
]);

/**
 * Tokenizer shared by the index builder and query time. Lowercase, split on
 * anything that is not a letter or digit, drop stopwords and 1-char tokens.
 * (No stemming: kept simple and deterministic; title/heading boosting in the
 * builder compensates for most vocabulary mismatch.)
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Deterministic keyword search over the bundled index.
 * `search_lessons(query, k)` from the tool allowlist.
 */
export function searchLessons(index: QaIndexData, query: string, k: number): QaSearchResult[] {
  if (k <= 0) return [];
  const seen = new Set<string>();
  const scores = new Map<number, number>();
  for (const term of tokenize(query)) {
    if (seen.has(term)) continue;
    seen.add(term);
    const entry = index.terms[term];
    if (!entry) continue;
    for (const [chunkId, score] of entry.postings) {
      scores.set(chunkId, (scores.get(chunkId) ?? 0) + score);
    }
  }
  if (scores.size === 0) return [];
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const out: QaSearchResult[] = [];
  for (const [chunkId, score] of ranked.slice(0, k)) {
    const meta = index.chunks[chunkId];
    // Chunks are emitted in id order, so position == id. If the generated
    // artifact ever violates that, fail loudly instead of misattributing.
    if (!meta || meta.id !== chunkId) {
      throw new Error(`qa index corrupt: chunk ${chunkId} misaligned`);
    }
    out.push({
      chunkId,
      slug: meta.slug,
      title: meta.title,
      heading: meta.heading,
      ordinal: meta.ordinal,
      excerpt: meta.excerpt,
      score,
    });
  }
  return out;
}

/** Unique {slug, title} citation pairs in rank order (for the SSE sources event). */
export function uniqueSources(results: QaSearchResult[]): Array<{ slug: string; title: string }> {
  const seen = new Set<string>();
  const out: Array<{ slug: string; title: string }> = [];
  for (const r of results) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    out.push({ slug: r.slug, title: r.title });
  }
  return out;
}

/** Lesson title for a slug (drives citation chips); undefined for unknown slugs. */
export function titleForSlug(index: QaIndexData, slug: string): string | undefined {
  for (const c of index.chunks) {
    if (c.slug === slug) return c.title;
  }
  return undefined;
}

/**
 * `read_lesson({slug})` from the tool allowlist (P2 consumes this; P1 seeds
 * the table). Concatenates the lesson's full chunk texts in ordinal order,
 * capped so one tool call cannot blow the model's context budget.
 */
export async function readLessonText(
  store: ChunkStore,
  slug: string,
  maxChars = 12000,
): Promise<string> {
  const chunks = (await store.getLessonChunks(slug)).sort((a, b) => a.ordinal - b.ordinal);
  if (chunks.length === 0) return '';
  let out = '';
  for (const c of chunks) {
    if (out.length >= maxChars) break;
    out += (out.length > 0 ? '\n\n' : '') + c.text;
  }
  if (out.length > maxChars) {
    return out.slice(0, maxChars) + '\n\n[…truncated]';
  }
  return out;
}

/** Production ChunkStore backed by the D1 qa_chunks table (migration 0006). */
export class D1ChunkStore implements ChunkStore {
  private readonly db: D1Like;

  constructor(db: D1Like) {
    this.db = db;
  }

  async getLessonChunks(slug: string): Promise<Array<{ ordinal: number; text: string }>> {
    const { results } = await this.db
      .prepare('SELECT ordinal, text FROM qa_chunks WHERE slug = ? ORDER BY ordinal ASC')
      .bind(slug)
      .all<{ ordinal: number; text: string }>();
    return results ?? [];
  }
}
