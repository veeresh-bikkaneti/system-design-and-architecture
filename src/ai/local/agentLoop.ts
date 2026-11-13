/**
 * Ben's tool loop (ADR 0001, Ben increment — Shape C as amended).
 *
 * Code-driven: this module decides every step; a model only ever
 * synthesises wording over sources code already retrieved. The loop serves
 * ONLY the router's `parametric_fallback` and `howto` routes — the router
 * stays sovereign and a grounded lesson answer never passes through here.
 *
 * Steps: lesson re-retrieval (existing embed/rank, injected) → Wikipedia
 * lookup (minimised canonical term; ADR §5 fit check; first-use disclosure
 * + remembered opt-out) → synthesis (injected) or extractive answer.
 * Citations are assigned HERE, from the sources actually retrieved this
 * turn; confidence comes from web.ts's shared post-condition.
 */
import { tokenize } from './retrieve.ts';
import type { Action } from './semantic/router.ts';
import { NO_SOURCE, sectionLead } from './semantic/turn.ts';
import type { ToolTrace } from './types.ts';
import { loopConfidence, type ConfidenceLevel } from './web.ts';

export interface LoopSource {
  kind: 'lesson' | 'wikipedia';
  /** Lesson slug, for lesson sources only. */
  id?: string;
  title: string;
  /** Canonical page URL, for Wikipedia sources only. */
  url?: string;
  text: string;
}

export interface WikiPage {
  title: string;
  url: string;
  extract: string;
}

export interface LoopDeps {
  /** Lesson re-retrieval over the existing index. Never throws out of the loop. */
  retrieve(question: string): Promise<LoopSource[]>;
  /** Wikipedia search by canonical term. Null = no page; a rejection = timeout/network. */
  searchWikipedia(term: string): Promise<WikiPage | null>;
  /** ADR §5 fit check: cosine of extract vs question. Null = check unavailable. */
  fitScore(extract: string, question: string): Promise<number | null>;
  /** Model synthesis over the retrieved sources. Null = no model; extractive path runs. */
  synthesize(question: string, sources: LoopSource[]): Promise<string | null>;
  /** False once the student has opted out of web lookups (remembered). */
  wikiEnabled(): boolean;
  /** Records a Wikipedia use; returns true only for the very first one. */
  markWikiUsed(): boolean;
}

export interface LoopCitation {
  kind: 'lesson' | 'wikipedia';
  id?: string;
  title: string;
  url?: string;
}

export interface LoopResult {
  answer: string;
  citations: LoopCitation[];
  confidence: { level: ConfidenceLevel; label: string };
  traces: ToolTrace[];
  usedWikipedia: boolean;
  /** True when this turn was the first-ever Wikipedia use: disclose it. */
  wikiFirstUse: boolean;
}

/** The only routes the loop may serve (Shape C scope fence). */
export function loopApplies(action: Action): boolean {
  return action === 'parametric_fallback' || action === 'howto';
}

/** ADR §5 fit bar for a Wikipedia extract (Seat C boundary call, council record). */
export const WIKI_FIT_MIN = 0.25;

/** Shown with the first answer that uses Wikipedia. Names the step truthfully. */
export const WIKI_DISCLOSURE =
  'New for this answer: I also looked this up on Wikipedia, a public website. Only the topic word was sent — never your question. If you would rather I did not, say "don\'t use the web" and I will remember.';

/**
 * The minimised canonical query term. Derived from content tokens only —
 * the student's sentence (and anything personal in it) never leaves.
 */
export function canonicalTopic(question: string, route: 'parametric_fallback' | 'howto'): string {
  let text = question.toLowerCase();
  // Privacy by construction, before any tokenising: an email address or a
  // "my name is …" span is removed outright, so an identifier planted in
  // the question cannot ride into the query.
  text = text.replace(/\S+@\S+/g, ' ').replace(/\bmy name is\s+\S+(\s+\S+)?/g, ' ');
  if (route === 'howto') {
    text = text
      .replace(/^.*?\b(install|set\s?up)\s+/, '')
      .replace(/\s+(on|for)\s+(windows|macos|mac os|linux|ubuntu|debian|fedora|arch)\b.*$/, '');
  } else {
    text = text
      .replace(/^(hi|hello|hey|please|ok|okay|so|well)[,.\s]+/, '')
      .replace(/^(what|who|why|how)\s+(is|are|was|were|does|do|did)\s+(a\s+|an\s+|the\s+)?/, '')
      .replace(/\b(written|written in|used for|mean|means)\b.*$/, '');
  }
  const tokens = tokenize(text);
  return tokens.slice(0, route === 'howto' ? 2 : 3).join(' ');
}

const NO_WEB_PHRASE =
  /\b(don'?t|do not|stop|never)\s+(use|using|check|search|consult)\s+(the\s+)?(web|wikipedia)\b|\bno wikipedia\b|\bstop using wikipedia\b|\bopt out\b/i;

/** A plain no-web request in the student's own words (remembered opt-out trigger). */
export function isWikiOptOut(text: string): boolean {
  return NO_WEB_PHRASE.test(text);
}

interface ConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CONSENT_KEY = 'ben-wikipedia-consent';

/** First-use disclosure + remembered opt-out state (localStorage in the browser). */
export function wikiConsent(storage?: ConsentStorage) {
  const store: ConsentStorage | undefined =
    storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const read = () => store?.getItem(CONSENT_KEY) ?? null;
  return {
    wikiEnabled: () => read() !== 'out',
    markWikiUsed: () => {
      if (read()) return false;
      store?.setItem(CONSENT_KEY, 'in');
      return true;
    },
    optOut: () => store?.setItem(CONSENT_KEY, 'out'),
  };
}

const WIKI_TIMEOUT_MS = 8_000;

/** The one external call the loop is authorised to make (Wikipedia API, keyless). */
export async function fetchWikipedia(term: string): Promise<WikiPage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WIKI_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: term,
      gsrlimit: '1',
      prop: 'extracts|info',
      inprop: 'url',
      explaintext: '1',
      format: 'json',
      origin: '*',
    });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { title?: string; canonicalurl?: string; extract?: string }> };
    };
    const page = Object.values(data.query?.pages ?? {})[0];
    if (!page?.title || !page.extract) return null;
    return { title: page.title, url: page.canonicalurl ?? '', extract: page.extract };
  } finally {
    clearTimeout(timer);
  }
}

/** Title relevance: the page must actually be about the canonical term. */
function titleMatches(page: WikiPage, term: string): boolean {
  if (/\(disambiguation\)/i.test(page.title)) return false;
  // Interrogatives are not topic tokens: "who" matching "Doctor Who" is the
  // exact failure this check exists to stop.
  const topic = (tokens: string[]) =>
    tokens.filter((token) => token.length >= 3 && !['who', 'what', 'why', 'how', 'when', 'where'].includes(token));
  const titleTokens = new Set(topic(tokenize(page.title)));
  return topic(tokenize(term)).some((token) => titleTokens.has(token));
}

export async function runAgentLoop(
  question: string,
  route: 'parametric_fallback' | 'howto',
  deps: LoopDeps,
): Promise<LoopResult> {
  const traces: ToolTrace[] = [];

  // Step 1 — lesson re-retrieval.
  let lessonSources: LoopSource[] = [];
  try {
    lessonSources = await deps.retrieve(question);
  } catch {
    lessonSources = [];
  }
  traces.push({
    name: 'search_lessons',
    input: JSON.stringify({ query: question }),
    output: `re-retrieval: ${lessonSources.length} lesson source${lessonSources.length === 1 ? '' : 's'}`,
  });

  // Step 2 — Wikipedia, under the privacy conditions.
  let wikiSource: LoopSource | null = null;
  let wikiFirstUse = false;
  if (deps.wikiEnabled()) {
    const term = canonicalTopic(question, route);
    let page: WikiPage | null = null;
    let outcome = 'no page found';
    try {
      page = await deps.searchWikipedia(term);
    } catch {
      outcome = 'lookup failed (timeout or network)';
    }
    if (page) {
      if (!titleMatches(page, term)) {
        outcome = `discarded: "${page.title}" does not match the topic`;
      } else {
        const fit = await deps.fitScore(page.extract, question).catch(() => null);
        if (fit !== null && fit < WIKI_FIT_MIN) {
          outcome = `discarded: extract fit ${fit.toFixed(2)} below the ${WIKI_FIT_MIN} bar`;
        } else {
          wikiSource = { kind: 'wikipedia', title: page.title, url: page.url, text: page.extract };
          outcome = `kept: ${page.title}`;
        }
      }
    }
    traces.push({ name: 'web_search', input: JSON.stringify({ query: term }), output: outcome });
    if (wikiSource) wikiFirstUse = deps.markWikiUsed();
  }

  const sources: LoopSource[] = [...lessonSources, ...(wikiSource ? [wikiSource] : [])];
  const citations: LoopCitation[] = sources.map((source) =>
    source.kind === 'lesson'
      ? { kind: 'lesson', id: source.id, title: source.title }
      : { kind: 'wikipedia', title: source.title, url: source.url },
  );
  // The shared post-condition: one call, both paths, sources empty ⇒ low.
  const confidence = loopConfidence(sources);

  if (sources.length === 0) {
    return { answer: NO_SOURCE, citations: [], confidence, traces, usedWikipedia: false, wikiFirstUse: false };
  }

  // Step 3 — synthesis if a model is offered one, else the extractive answer.
  let answer: string | null = null;
  try {
    answer = await deps.synthesize(question, sources);
  } catch {
    answer = null;
  }
  if (!answer) {
    answer = sources.map((source) => sectionLead(source.text)).filter(Boolean).join('\n\n');
  }

  return {
    answer,
    citations,
    confidence,
    traces,
    usedWikipedia: Boolean(wikiSource),
    wikiFirstUse,
  };
}
