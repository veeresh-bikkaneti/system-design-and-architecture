export interface WebHit {
  title: string;
  url: string;
  extract: string;
}

interface WikiSearch {
  query?: { search?: { title: string; pageid: number }[] };
}

/** Wikipedia's public API allows browser calls. No key, and the URL is citable. */
export function wikiSearchUrl(query: string): string {
  return `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "4",
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
  { pattern: /\bplaywright\b/i, query: "Playwright (software)" },
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

function isDisambiguation(extract: string): boolean {
  return /may refer to/i.test(extract);
}

interface WikiSummary {
  title?: string;
  extract?: string;
  type?: string;
  content_urls?: { desktop?: { page?: string } };
}

async function summaryByTitle(title: string, fetchImpl: typeof fetch): Promise<WebHit | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  const data = (await response.json()) as WikiSummary;
  if (data.type === "disambiguation") return null;
  const extract = data.extract?.replace(/\s+/g, " ").trim() ?? "";
  if (!extract || isDisambiguation(extract)) return null;
  return {
    title: data.title || title,
    url: data.content_urls?.desktop?.page || wikiPageUrl(data.title || title),
    extract,
  };
}

/**
 * Look up one Wikipedia intro. Never throws.
 * Skips disambiguation pages such as "Playwright" the person-or-tool list.
 */
export async function searchWeb(query: string, fetchImpl: typeof fetch = fetch): Promise<WebHit[]> {
  const trimmed = query.trim().slice(0, 180);
  if (!trimmed) return [];
  try {
    const direct = await summaryByTitle(trimmed, fetchImpl);
    if (direct) return [direct];
    const found = (await (await fetchImpl(wikiSearchUrl(trimmed))).json()) as WikiSearch;
    const titles = (found.query?.search ?? []).map((hit) => hit.title).filter(Boolean).slice(0, 4);
    for (const title of titles) {
      const hit = await summaryByTitle(title, fetchImpl);
      if (hit) return [hit];
    }
  } catch {
    return [];
  }
  return [];
}
