import type { OkfCard, ScoredCard } from "./types.ts";

const STOP = new Set([
  "the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "is", "are",
  "what", "how", "why", "does", "do", "when", "with", "about", "from", "that",
  "this", "it", "be", "can", "i", "you", "my", "me", "vs", "versus", "please",
  "explain", "tell", "describe", "difference", "between", "should", "would",
  "could", "into", "your", "our", "their", "its", "if", "we", "they", "just",
  "write", "give", "make", "show", "help", "want", "need", "like", "use",
  "using", "work", "mean", "means", "something", "anything", "really",
]);

const K1 = 1.2;
const B = 0.75;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/[\s-]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function termFreq(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) freq.set(token, (freq.get(token) ?? 0) + 1);
  return freq;
}

/** BM25 over title, tags, summary, and body. Title hits get a small extra bump. */
export function searchCards(query: string, cards: OkfCard[], limit = 3): ScoredCard[] {
  if (cards.length === 0) return [];
  const docs = cards.map((card) =>
    tokenize(`${card.title} ${card.title} ${card.tags.join(" ")} ${card.summary} ${card.body}`),
  );
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const avg = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length;
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const token of new Set(doc)) df.set(token, (df.get(token) ?? 0) + 1);
  }

  const scored = docs.map((doc, index) => {
    const tf = termFreq(doc);
    let score = 0;
    for (const token of queryTokens) {
      const freq = tf.get(token) ?? 0;
      if (!freq) continue;
      const docsWith = df.get(token) ?? 0;
      const idf = Math.log(1 + (cards.length - docsWith + 0.5) / (docsWith + 0.5));
      const denom = freq + K1 * (1 - B + B * (doc.length / avg));
      score += (idf * (freq * (K1 + 1))) / denom;
    }
    const titleTokens = new Set(tokenize(cards[index]?.title ?? ""));
    for (const token of queryTokens) {
      if (titleTokens.has(token)) score += 0.75;
    }
    const card = cards[index];
    if (!card) return null;
    return { card, score };
  });

  return scored
    .filter((row): row is ScoredCard => row !== null && row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Tokens that name the card: id, title, and tags. Not the body. */
export function nameTokens(card: OkfCard): Set<string> {
  return new Set(tokenize(`${card.id} ${card.title} ${card.tags.join(" ")}`));
}

/** True when the student named this card, even with a single word like "MVC". */
export function aliasHit(query: string, card: OkfCard): boolean {
  const names = nameTokens(card);
  return tokenize(query).some((token) => names.has(token));
}
export function distinctiveOverlap(query: string, card: OkfCard, cards: OkfCard[]): number {
  const queryTokens = new Set(tokenize(query));
  const cardTokens = new Set(tokenize(`${card.title} ${card.tags.join(" ")} ${card.summary} ${card.body}`));
  const docs = cards.map((item) => new Set(tokenize(`${item.title} ${item.tags.join(" ")} ${item.body}`)));
  let hits = 0;
  for (const token of queryTokens) {
    if (!cardTokens.has(token)) continue;
    const df = docs.reduce((count, doc) => count + (doc.has(token) ? 1 : 0), 0);
    if (df <= Math.ceil(cards.length * 0.2)) hits += 1;
  }
  return hits;
}

/** Questions with almost no overlap are off the course. Tuned against the bundle. */
export const SCOPE_FLOOR = 1.15;

export function bestScore(hits: ScoredCard[]): number {
  return hits[0]?.score ?? 0;
}
