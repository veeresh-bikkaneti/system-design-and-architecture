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
  pinned?: string[];
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

/**
 * Unique single-token tags the student typed ("DDD", "local").
 * Uniqueness is over Lesson+Guide *names* (id, title, tags), not tags
 * alone: "frontend" is only a tag on MVC, but BFF's title also says
 * frontend, so pinning MVC would steal "backend for frontend pattern".
 * Lesson pins stay acronym-short; longer unique tags ("replica") are
 * ordinary words. Guides still pin on a longer unique tag ("local")
 * because `tutor-loop` is not in the lesson index.
 * `namedLessons` stays Lesson-only so a Guide sharing "react" does not
 * drop the MVC name boost.
 */
const DISTINCT_TAG_PINS: Map<string, string> = (() => {
  const owners = new Map<string, Set<string>>();
  for (const card of OKF_CARDS) {
    if (card.type !== 'Lesson' && card.type !== 'Guide') continue;
    for (const token of nameTokens(card)) {
      if (token.length < 3) continue;
      const set = owners.get(token) ?? new Set<string>();
      set.add(card.id);
      owners.set(token, set);
    }
  }
  const unique = new Map<string, string>();
  for (const [token, set] of owners) {
    if (set.size === 1) unique.set(token, [...set][0] as string);
  }
  const out = new Map<string, string>();
  for (const card of OKF_CARDS) {
    if (card.type !== 'Lesson' && card.type !== 'Guide') continue;
    for (const tag of card.tags) {
      const tagTokens = tokenize(tag);
      if (tagTokens.length !== 1) continue;
      const tagToken = tagTokens[0];
      if (!tagToken || unique.get(tagToken) !== card.id) continue;
      if (card.type !== 'Guide' && tagToken.length > 4) continue;
      out.set(tagToken, card.id);
    }
  }
  return out;
})();

/**
 * Setup of this tutor, including the spaced verb "set up" that tokenize splits.
 *
 * "Set up my AI env" is a coin toss: Ben's own on-device AI, or the student's
 * own dev box? UNVERIFIED, low-confidence call: with no other clue we read it
 * as Ben (that's the live report). Any own-machine signal (Python, Docker,
 * "my laptop", env variables...) or a vendor prefix ("open ai env", "azure
 * ai environment") skips the pin and leaves it unpinned: normal routing
 * decides. No bare "ai" pin: "set up an AI pipeline" belongs to Designing
 * AI Systems.
 */
function isTutorSetupQuestion(question: string): boolean {
  const text = question.toLowerCase();
  const setup = /\bset\s*up\b|\bsetup\b|\binstall\b/.test(text);
  const tutor = /\blocal\s+ai\b|\bwebllm\b|\bprompt api\b|\btutor\b|\bben\b/.test(text);
  if (setup && tutor) return true;
  // "the ai set up / setup" is a thing ("what is the ai setup netflix uses"),
  // so it doesn't count as the verb... unless it follows "get": "get the ai
  // set up" is someone asking for help. ponytail: "get" is the only request
  // verb read here; add "have"/"need" if a real report needs it.
  const request = /\bget\s+the\s+ai\s+set\s*up\b/.test(text);
  const verb = request || /\bset\s*up\b|\bsetup\b|\binstall\b/.test(text.replace(/\bthe\s+ai\s+set\s*up\b/g, ''));
  const aiEnv = /\bai\s+env(ironment)?\b|\bthe\s+ai\s+set\s*up\b/.test(text);
  const ownBox =
    /\b(python|venv|cuda|conda|pip|pipenv|docker|laptop|mac|macbook|wsl|jupyter|gpu|variables|api key)\b|\bdev(elopment)?\s+env|\bmy\s+(machine|project)\b|\b(open|azure)\s+ai\b/.test(
      text,
    );
  return verb && aiEnv && !ownBox;
}

export function namedTagLessons(question: string): string[] {
  const tokens = tokenize(question);
  const slugs = new Set<string>();
  if (isTutorSetupQuestion(question)) slugs.add('tutor-loop');
  if (tokens.length === 0 || tokens.length > THRESHOLDS.nameBoostMaxTokens) return [...slugs];
  for (const token of tokens) {
    const slug = DISTINCT_TAG_PINS.get(token);
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
  // No bare-vote self branch here: every genuine "about Ben" phrasing in
  // evals/ben/{cases,holdout}.json is already caught by isAboutTutor above.
  // Trusting the embedding vote alone let a generic "who is X" question about
  // an unrelated named person (e.g. an actor) embed close enough to "who are
  // you"-style examples to get Ben's own about-me answer -- a real drift bug,
  // not a feature. An unconfirmed 'self' vote now falls through to the rest
  // of the policy table instead, same as any other question no lesson covers.

  // Unique tags beat nearest-chunk ranking. Live "DDD" otherwise leads
  // Anti-Corruption Layer because that MDX quotes the DDD books, and the
  // 0.45 gate would return before a later pin could fire.
  const namedTags = namedTagLessons(question);
  if (namedTags.length > 0) {
    const pinned = namedTags.map((slug) => {
      const hit = lessons.find((lesson) => lesson.slug === slug);
      return hit ?? { slug, score: THRESHOLDS.lesson, best: THRESHOLDS.lesson, chunks: [] };
    });
    const rest = lessons.filter((lesson) => !namedTags.includes(lesson.slug));
    return {
      ...base,
      action: 'lesson',
      lessons: [...pinned, ...rest].slice(0, 3),
      pinned: namedTags,
      reasons: [`named tag ${namedTags.join(', ')}`, ...reasons],
    };
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
