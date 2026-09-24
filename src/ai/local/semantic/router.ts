/**
 * Ben's router: decide what a question is and what to do about it.
 *
 * Pure: it takes the question's embedding and the decoded index, and returns a
 * Decision with the reasons that produced it. No I/O, no model calls. The
 * thresholds are tuned against evals/ben/cases.json (`npm run eval:ben`),
 * never against one screenshot. See docs/adr/0001-ben-semantic-routing.md.
 */
import { OKF_CARDS } from '../cards.ts';
import { buildQuery, isAboutTutor, isFollowUp, isOffCourseTopic } from '../agent.ts';
import { nameTokens, tokenize } from '../retrieve.ts';
import type { ChatTurn } from '../types.ts';
import { dot, INTENTS, type BenIndex, type Intent, type LessonChunk } from './codec.ts';

export type Action = 'self' | 'lesson' | 'clarify' | 'parametric_fallback' | 'redirect';

export interface LessonHit {
  slug: string;
  /** Ranking score: best section blended with coverage depth, plus any name boost. */
  score: number;
  /** Similarity of the single best section (plus any name boost). The thresholds read this. */
  best: number;
  /** Best-matching sections, strongest first. */
  chunks: LessonChunk[];
}

export interface Decision {
  action: Action;
  intent: Intent;
  /** Share of the k-NN vote the winning intent received (0–1). */
  intentConfidence: number;
  intentScores: Record<Intent, number>;
  lessons: LessonHit[];
  reasons: string[];
}

export const THRESHOLDS = {
  /** Nearest examples that vote on the intent. */
  k: 7,
  /** A course question needs a section at least this close to answer from it. */
  lesson: 0.45,
  /** Below `lesson` but above this: offer the closest lessons instead of guessing. */
  clarify: 0.33,
  /** A lesson's score blends its best section with its next two (depth of coverage). */
  depth: 0.25,
  /** A rule verdict (about Ben) loses to an off-course vote this confident. */
  ruleVeto: 0.7,
  /** Debate or off-topic intent is overruled only by a lesson this close. */
  override: 0.62,
  /** ...and only when the off-course vote is this unsure. */
  overrideVote: 0.6,
  /** Added to a lesson the student named outright ("MVC", "Raft", "RPO"). */
  nameBoost: 0.08,
  /**
   * Only short questions get the name boost. Acronyms embed poorly; sentences
   * embed well, and in a sentence a title word ("client") is not a name.
   */
  nameBoostMaxTokens: 3,
  /** Qwen's draft must stay this close to the material it was given. */
  draftFit: 0.45,
} as const;

const LESSON_SLUGS = new Set(OKF_CARDS.filter((card) => card.type === 'Lesson').map((card) => card.id));

/** Name tokens that belong to exactly one lesson, so naming them is unambiguous. */
const DISTINCT_NAMES: Map<string, string> = (() => {
  const owners = new Map<string, Set<string>>();
  for (const card of OKF_CARDS) {
    if (!LESSON_SLUGS.has(card.id)) continue;
    for (const token of nameTokens(card)) {
      if (token.length < 3) continue;
      const set = owners.get(token) ?? new Set<string>();
      set.add(card.id);
      owners.set(token, set);
    }
  }
  const out = new Map<string, string>();
  for (const [token, set] of owners) {
    if (set.size === 1) out.set(token, [...set][0] as string);
  }
  return out;
})();

export function namedLessons(question: string): string[] {
  const tokens = tokenize(question);
  if (tokens.length > THRESHOLDS.nameBoostMaxTokens) return [];
  const slugs = new Set<string>();
  for (const token of tokens) {
    const slug = DISTINCT_NAMES.get(token);
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

/** The text to embed: short follow-ups ("give an example") carry the previous question. */
export function queryText(question: string, history: ChatTurn[] = []): string {
  return buildQuery(question, history);
}

export function voteIntent(vector: Float32Array, index: BenIndex, k: number = THRESHOLDS.k) {
  const nearest = index.examples
    .map((example) => ({ intent: example.intent, score: dot(vector, example.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  const scores = Object.fromEntries(INTENTS.map((intent) => [intent, 0])) as Record<Intent, number>;
  let total = 0;
  for (const hit of nearest) {
    // Squared, not linear: every question has *some* similarity to *something*, so k=7
    // almost always includes a few weak, unrelated neighbours. Summed linearly, several
    // weak off-topic echoes can outvote one clearly closer course match. Squaring lets
    // the closest neighbour(s) dominate instead of being outvoted by noise.
    const weight = hit.score > 0 ? hit.score ** 2 : 0;
    scores[hit.intent] += weight;
    total += weight;
  }
  for (const intent of INTENTS) scores[intent] = total > 0 ? scores[intent] / total : 0;
  const intent = INTENTS.reduce((best, next) => (scores[next] > scores[best] ? next : best), 'course' as Intent);
  return { intent, confidence: scores[intent], scores };
}

export function rankLessons(vector: Float32Array, index: BenIndex, named: string[] = []): LessonHit[] {
  const bySlug = new Map<string, { chunks: { chunk: LessonChunk; score: number }[] }>();
  for (const chunk of index.chunks) {
    const score = dot(vector, chunk.vector);
    const entry = bySlug.get(chunk.slug) ?? { chunks: [] };
    entry.chunks.push({ chunk, score });
    bySlug.set(chunk.slug, entry);
  }
  return [...bySlug.entries()]
    .map(([slug, entry]) => {
      const sorted = entry.chunks.sort((a, b) => b.score - a.score);
      const best = sorted[0]?.score ?? 0;
      const next = sorted.slice(1, 3);
      const depth = next.length > 0 ? next.reduce((sum, row) => sum + row.score, 0) / next.length : best;
      const blended = (1 - THRESHOLDS.depth) * best + THRESHOLDS.depth * depth;
      const boost = named.includes(slug) ? THRESHOLDS.nameBoost : 0;
      return {
        slug,
        score: blended + boost,
        best: best + boost,
        chunks: sorted.slice(0, 2).map((row) => row.chunk),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export interface RouteInput {
  question: string;
  /** Lesson open on the page, if any. */
  focusId?: string;
  /** Embedding of `queryText(question, history)`: recent turns reach the router through it. */
  vector: Float32Array;
  index: BenIndex;
}

function fixed(value: number): string {
  return value.toFixed(2);
}

export function route({ question, focusId, vector, index }: RouteInput): Decision {
  const vote = voteIntent(vector, index);
  const named = namedLessons(question);
  const lessons = rankLessons(vector, index, named);
  const top = lessons[0];
  // Rank by coverage, but judge "is this covered at all" by the single best section.
  const topScore = top?.best ?? 0;
  const base = {
    intent: vote.intent,
    intentConfidence: vote.confidence,
    intentScores: vote.scores,
    lessons: lessons.slice(0, 3),
  };
  const reasons = [
    `intent ${vote.intent} (${fixed(vote.confidence)} of the vote)`,
    top ? `closest lesson ${top.slug} (${fixed(topScore)})` : 'no lesson sections',
  ];
  if (named.length > 0) reasons.push(`named: ${named.join(', ')}`);

  // Rule layer: cheap, high-precision, and already covered by tests.
  if (isOffCourseTopic(question)) {
    return { ...base, action: 'redirect', reasons: ['blocked topic', ...reasons] };
  }
  const offCourse = vote.intent === 'debate' || vote.intent === 'off_topic';
  if (isFollowUp(question) || (isAboutTutor(question) && !(offCourse && vote.confidence >= THRESHOLDS.ruleVeto))) {
    return { ...base, action: 'self', intent: 'self', reasons: ['about Ben or a follow-up', ...reasons] };
  }
  if (focusId && LESSON_SLUGS.has(focusId) && tokenize(question).length === 0) {
    const focus = lessons.find((lesson) => lesson.slug === focusId);
    const pinned = focus ?? { slug: focusId, score: topScore, best: topScore, chunks: [] };
    return {
      ...base,
      action: 'lesson',
      intent: 'course',
      lessons: [pinned, ...lessons.filter((lesson) => lesson.slug !== focusId)].slice(0, 3),
      reasons: [`"this" means the open lesson ${focusId}`, ...reasons],
    };
  }

  if (offCourse) {
    if (topScore >= THRESHOLDS.override && vote.confidence < THRESHOLDS.overrideVote) {
      return { ...base, action: 'lesson', reasons: ['a lesson matches strongly despite the vote', ...reasons] };
    }
    return { ...base, action: 'redirect', reasons: [`${vote.intent} is outside the course`, ...reasons] };
  }
  if (vote.intent === 'self') {
    return { ...base, action: 'self', reasons: ['reads like a question to Ben', ...reasons] };
  }
  // Whether the course covers it is a retrieval fact, not an intent: "what is MVC"
  // reads like a general tech question, but the MVC lesson answers it.
  if (topScore >= THRESHOLDS.lesson) {
    return { ...base, action: 'lesson', reasons: ['a lesson covers this', ...reasons] };
  }
  if (vote.intent === 'tech') {
    return { ...base, action: 'parametric_fallback', reasons: ['general tech, no lesson covers it', ...reasons] };
  }
  if (topScore >= THRESHOLDS.clarify) {
    return { ...base, action: 'clarify', reasons: ['course question, no lesson is a clear match', ...reasons] };
  }
  return { ...base, action: 'redirect', reasons: ['no lesson is close enough', ...reasons] };
}
