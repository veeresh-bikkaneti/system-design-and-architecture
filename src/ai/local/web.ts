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
