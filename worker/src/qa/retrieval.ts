// P1 (course Q&A tutor): lesson retrieval over the D1 FTS5 index.
//
// The index itself is built at deploy time by `npm run qa:index`
// (scripts/qa/build-index.mjs -> worker/migrations/0006_qa_chunks.sql):
// `qa_chunks` holds ~500-token lesson chunks, `qa_chunks_fts` is the FTS5
// index with AFTER INSERT/UPDATE/DELETE triggers keeping it in sync.
//
// SECURITY CONTRACT (P2 agent builds on this — do not weaken):
//   - User input NEVER reaches SQL as text. `sanitizeFtsQuery` reduces the
//     query to double-quoted alphanumeric phrases joined by implicit AND,
//     and the MATCH parameter is always bound, never interpolated.
//   - `readLessonText` validates the slug against a strict allowlist regex
//     and returns null without touching the DB otherwise.
//   - Quiz content is excluded upstream: the generator strips every <Quiz>
//     block, so answer keys cannot leak through retrieval.

export interface ChunkHit {
  slug: string;
  title: string;
  heading: string;
  excerpt: string;
  score: number;
}

/** Default number of chunks returned by searchLessons. */
export const DEFAULT_TOP_K = 5;

/** Hard bounds for the caller's `k` — keeps result sets (and token spend) sane. */
const MIN_TOP_K = 1;
const MAX_TOP_K = 10;

/**
 * Reduce a raw user query to a safe FTS5 MATCH expression: lowercase,
 * alphanumeric tokens only, tokens shorter than 2 chars dropped, capped at
 * 10 terms, each wrapped in double quotes (embedded quotes doubled for
 * defense in depth), joined by implicit AND.
 *
 * Hostile input (`" OR "1"="1`, `*`, `NEAR(`, unbalanced quotes, column
 * filters like `title:foo`) collapses to harmless quoted phrases — it can
 * neither throw in FTS5 nor match everything.
 */
export function sanitizeFtsQuery(query: string): string {
  const tokens = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const terms = tokens
    .filter((t) => t.length >= 2)
    .slice(0, 10)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  // An empty phrase matches nothing in FTS5; callers short-circuit blank
  // queries before hitting the DB anyway.
  return terms.length > 0 ? terms.join(' ') : '""';
}

const SEARCH_SQL = [
  'SELECT c.slug, c.title, c.heading,',
  "       snippet(qa_chunks_fts, 3, '', '', '…', 24) AS excerpt,",
  '       bm25(qa_chunks_fts) AS score',
  'FROM qa_chunks_fts',
  'JOIN qa_chunks c ON c.id = qa_chunks_fts.rowid',
  'WHERE qa_chunks_fts MATCH ?',
  'ORDER BY score',
  'LIMIT ?',
].join(' ');

interface ChunkRow {
  slug: string;
  title: string;
  heading: string;
  excerpt: string;
  score: number;
}

/**
 * Full-text search over lesson chunks. `query` is sanitized and BOUND as
 * the MATCH parameter — never interpolated into SQL. Returns at most `k`
 * hits (clamped to 1..10, default 5), best bm25 score first. Blank queries
 * return [] without touching the DB.
 */
export async function searchLessons(
  db: D1Database,
  query: string,
  k: number = DEFAULT_TOP_K,
): Promise<ChunkHit[]> {
  if (!query || query.trim().length === 0) return [];
  const topK = Math.min(MAX_TOP_K, Math.max(MIN_TOP_K, Math.floor(k)));
  const result = await db.prepare(SEARCH_SQL).bind(sanitizeFtsQuery(query), topK).all<ChunkRow>();
  return (result.results ?? []).map((row) => ({
    slug: row.slug,
    title: row.title,
    heading: row.heading,
    excerpt: row.excerpt,
    score: row.score,
  }));
}

export interface LessonText {
  slug: string;
  title: string;
  text: string;
  truncated: boolean;
}

/** Default character cap for readLessonText — full-lesson reads stay bounded. */
export const READ_LESSON_MAX_CHARS = 12000;

/**
 * Reassemble a lesson's chunks (ordinal order) into plain text. The slug is
 * validated against a strict allowlist before any DB access; unknown or
 * invalid slugs return null. Text longer than `maxChars` is cut with
 * `truncated: true`.
 */
export async function readLessonText(
  db: D1Database,
  slug: string,
  maxChars: number = READ_LESSON_MAX_CHARS,
): Promise<LessonText | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const titleRow = await db
    .prepare('SELECT title FROM qa_chunks WHERE slug = ? ORDER BY ordinal LIMIT 1')
    .bind(slug)
    .first<{ title: string }>();
  if (titleRow === null) return null;
  const chunks = await db
    .prepare('SELECT text FROM qa_chunks WHERE slug = ? ORDER BY ordinal')
    .bind(slug)
    .all<{ text: string }>();
  const full = (chunks.results ?? []).map((r) => r.text).join('\n\n');
  if (full.length <= maxChars) {
    return { slug, title: titleRow.title, text: full, truncated: false };
  }
  return { slug, title: titleRow.title, text: full.slice(0, maxChars), truncated: true };
}
