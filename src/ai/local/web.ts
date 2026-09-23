export interface WebHit {
  title: string;
  url: string;
  extract: string;
}

interface WikiSearch {
  query?: { search?: { title: string; pageid: number }[] };
}

interface WikiExtract {
  query?: { pages?: Record<string, { title?: string; extract?: string }> };
}

/** Wikipedia's public API allows browser calls. No key, and the URL is citable. */
export function wikiSearchUrl(query: string): string {
  return `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "1",
    format: "json",
    origin: "*",
    utf8: "1",
  })}`;
}

export function wikiExtractUrl(pageId: number): string {
  return `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
    action: "query",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    pageids: String(pageId),
    format: "json",
    origin: "*",
    utf8: "1",
  })}`;
}

const LANGUAGE_QUERIES: { pattern: RegExp; query: string }[] = [
  { pattern: /\bjavascript\b|\bjs\b/i, query: "JavaScript" },
  { pattern: /\btypescript\b/i, query: "TypeScript" },
  { pattern: /\bc\s*#|c\s*sharp|csharp\b/i, query: "C Sharp (programming language)" },
  { pattern: /\bjava\b/i, query: "Java (programming language)" },
  { pattern: /\bpython\b/i, query: "Python (programming language)" },
  { pattern: /\bgolang\b|\bgo lang\b/i, query: "Go (programming language)" },
  { pattern: /\brust\b/i, query: "Rust (programming language)" },
  { pattern: /\bkotlin\b/i, query: "Kotlin (programming language)" },
];

/** Turn a beginner question into a Wikipedia search that does not land on the wrong page. */
export function webQuery(question: string, lessonTitle?: string): string {
  for (const rule of LANGUAGE_QUERIES) {
    if (rule.pattern.test(question)) return rule.query;
  }
  if (lessonTitle) return lessonTitle;
  const stripped = question
    .replace(/^(what is|what's|whats|who is|explain|define|tell me about)\s+/i, "")
    .replace(/[?#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || question.trim();
}

export type ConfidenceLevel = "high" | "medium" | "low";

export function grounding(options: {
  aboutMe: boolean;
  inScope: boolean;
  citedWeb: boolean;
}): { level: ConfidenceLevel; label: string } {
  if (options.aboutMe) return { level: "high", label: "High confidence · I'm Ben" };
  if (options.inScope && options.citedWeb) {
    return { level: "high", label: "High confidence · course lesson, checked against a published page" };
  }
  if (options.inScope) return { level: "high", label: "High confidence · from the course lesson" };
  if (options.citedWeb) {
    return { level: "medium", label: "Medium confidence · not a lesson here. Checked a published page just now" };
  }
  return { level: "low", label: "Low confidence · I could not find a source, so I will not guess" };
}

export function wikiPageUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function firstSentences(text: string, count: number): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(" ");
}

/** Tutor voice over a cited page. The link is shown separately. */
export function spokenWeb(hit: WebHit): string {
  const lead = firstSentences(hit.extract, 2);
  return `${lead}\n\nThat is from a published page, not from one of these lessons. The source is under this message.`;
}

export function webAside(hit: WebHit): string {
  const lead = firstSentences(hit.extract, 1);
  return lead ? `\n\nA published page adds this: ${lead}` : "";
}

/**
 * Look up one Wikipedia intro. Throws if the network fails.
 * Returns [] when Wikipedia has no page. The caller cites `url`.
 */
export async function searchWeb(query: string, fetchImpl: typeof fetch = fetch): Promise<WebHit[]> {
  const trimmed = query.trim().slice(0, 180);
  if (!trimmed) return [];
  const found = (await (await fetchImpl(wikiSearchUrl(trimmed))).json()) as WikiSearch;
  const top = found.query?.search?.[0];
  if (!top?.title || !top.pageid) return [];
  const page = (await (await fetchImpl(wikiExtractUrl(top.pageid))).json()) as WikiExtract;
  const extract = page.query?.pages?.[String(top.pageid)]?.extract?.replace(/\s+/g, " ").trim() ?? "";
  if (!extract) return [];
  return [{ title: top.title, url: wikiPageUrl(top.title), extract }];
}
