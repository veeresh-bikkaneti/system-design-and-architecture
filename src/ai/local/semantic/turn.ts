/**
 * Turn a router Decision into what Ben says. Pure, so every action's reply is
 * testable without a model or a network.
 */
import { OKF_CARDS } from '../cards.ts';
import { askShape, formatContext, OFF_COURSE, socialAnswer, spokenAnswer } from '../agent.ts';
import type { ChatTurn, OkfCard, ToolTrace } from '../types.ts';
import type { ConfidenceLevel } from '../web.ts';
import { THRESHOLDS, type Action, type Decision, type LessonHit } from './router.ts';

export interface SemanticTurn {
  action: Action;
  answer: string;
  /** Lessons cited under the reply. */
  sources: { id: string; title: string }[];
  traces: ToolTrace[];
  /** Material handed to Qwen for rewording. Empty means "do not reword". */
  context: string;
  confidence: { level: ConfidenceLevel; label: string };
}

export const NO_SOURCE = 'I could not find a source for that, so I will not guess.';

const HIGH_MATCH = 0.55;
const MAX_LEAD_WORDS = 70;

function card(slug: string): OkfCard | undefined {
  return OKF_CARDS.find((item) => item.id === slug);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** The opening of the best-matching section, cut at a sentence boundary. */
export function sectionLead(text: string): string {
  const out: string[] = [];
  let words = 0;
  for (const sentence of sentences(text.replace(/…$/, ''))) {
    const size = sentence.split(/\s+/).length;
    if (out.length > 0 && words + size > MAX_LEAD_WORDS) break;
    out.push(sentence);
    words += size;
  }
  return out.join(' ');
}

function cited(lessons: LessonHit[]): { id: string; title: string }[] {
  return lessons
    .map((lesson) => card(lesson.slug))
    .filter((item): item is OkfCard => Boolean(item))
    .map((item) => ({ id: item.id, title: item.title }));
}

function searchTrace(question: string, decision: Decision): ToolTrace {
  return {
    name: 'search_lessons',
    input: JSON.stringify({ query: question }),
    output: `${decision.action}: ${decision.reasons.join('; ')}`,
  };
}

export function buildTurn(question: string, history: ChatTurn[], decision: Decision): SemanticTurn {
  const traces: ToolTrace[] = [searchTrace(question, decision)];
  const [lead, second] = decision.lessons;

  if (decision.action === 'self') {
    return {
      action: 'self',
      answer: socialAnswer(question, history),
      sources: [],
      traces,
      context: '',
      confidence: { level: 'high', label: "High confidence · I'm Ben" },
    };
  }

  if (decision.action === 'redirect' || !lead) {
    return {
      action: 'redirect',
      answer: OFF_COURSE,
      sources: [],
      traces,
      context: '',
      confidence: { level: 'low', label: 'Off topic · outside this course' },
    };
  }

  if (decision.action === 'lookup') {
    return {
      action: 'lookup',
      answer: NO_SOURCE,
      sources: [],
      traces,
      context: '',
      confidence: { level: 'low', label: 'Low confidence · I could not find a source, so I will not guess' },
    };
  }

  if (decision.action === 'clarify') {
    const offered = cited([lead, second].filter((hit): hit is LessonHit => Boolean(hit)));
    const names = offered.map((item) => `**${item.title}**`).join(' or ');
    return {
      action: 'clarify',
      answer: `I can't tell whether that's about this course. If you mean ${names}, the lesson${offered.length > 1 ? 's are' : ' is'} linked below, so ask me about it. If not, it's outside what I cover.`,
      sources: offered,
      traces,
      context: '',
      confidence: { level: 'low', label: 'Not sure · closest lessons offered' },
    };
  }

  // Answer from the lesson. A close runner-up is cited too; it is often the other half.
  const chosen = [lead, second].filter(
    (hit): hit is LessonHit =>
      Boolean(hit) && (hit === lead || (hit.best >= THRESHOLDS.lesson && lead.score - hit.score <= 0.03)),
  );
  const cards = chosen.map((hit) => card(hit.slug)).filter((item): item is OkfCard => Boolean(item));
  const section = lead.chunks[0];
  const previous = [...history].reverse().find((turn) => turn.role === 'assistant')?.content.trim();

  let answer = askShape(question) === 'plain' && section ? sectionLead(section.text) : spokenAnswer(question, cards, history);
  if (!answer || answer === previous) answer = spokenAnswer(question, cards, history);

  const sections = chosen
    .flatMap((hit) => hit.chunks.map((chunk) => ({ hit, chunk })))
    .map(({ hit, chunk }) => `From the lesson "${card(hit.slug)?.title ?? hit.slug}", section "${chunk.heading}":\n${chunk.text}`)
    .join('\n\n');
  traces.push({
    name: 'read_concept',
    input: JSON.stringify({ ids: chosen.map((hit) => hit.slug) }),
    output: [lead.chunks[0]?.heading, lead.chunks[1]?.heading].filter(Boolean).join('; '),
  });

  const title = card(lead.slug)?.title ?? lead.slug;
  return {
    action: 'lesson',
    answer,
    sources: cited(chosen),
    traces,
    context: [formatContext(cards), sections].filter(Boolean).join('\n\n'),
    confidence:
      lead.best >= HIGH_MATCH
        ? { level: 'high', label: `High confidence · from the lesson ${title}` }
        : { level: 'medium', label: `Medium confidence · closest lesson is ${title}` },
  };
}
