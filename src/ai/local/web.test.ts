import { describe, expect, it } from 'vitest';
import { needsWeb, prepareTurn } from './agent.ts';
import { spokenWeb, webAside, wikiPageUrl, wikiSearchUrl, searchWeb, type WebHit } from './web.ts';

const java: WebHit = {
  title: 'Java (programming language)',
  url: 'https://en.wikipedia.org/wiki/Java_(programming_language)',
  extract: 'Java is a high-level programming language. It runs on a virtual machine.',
};

describe('web tool', () => {
  it('searches the web only when the lessons miss or a source is requested', () => {
    expect(needsWeb('what is java', false)).toBe(true);
    expect(needsWeb('analogy for MVC', true)).toBe(false);
    expect(needsWeb('cite a source for the CAP theorem', true)).toBe(true);
    expect(needsWeb('Write a poem about my cat', false)).toBe(false);
    expect(needsWeb('who are you', false)).toBe(false);
  });

  it('cites a wikipedia article instead of guessing', () => {
    const answer = spokenWeb(java);
    expect(answer).toMatch(/Java is a high-level/);
    expect(answer).toMatch(/published page/);
    expect(wikiPageUrl(java.title)).toBe(
      'https://en.wikipedia.org/wiki/Java_(programming_language)',
    );
    expect(wikiSearchUrl('java')).toContain('origin=*');
    expect(webAside(java)).toMatch(/Java is a high-level/);
  });

  it('reads the extract the tool returns', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('list=search')) {
        return new Response(JSON.stringify({ query: { search: [{ title: 'CAP theorem', pageid: 1 }] } }));
      }
      return new Response(
        JSON.stringify({ query: { pages: { '1': { extract: 'CAP is a theorem. It is about partitions.' } } } }),
      );
    }) as typeof fetch;
    const hits = await searchWeb('CAP theorem', fetchImpl);
    expect(hits[0]?.title).toBe('CAP theorem');
    expect(hits[0]?.url).toBe('https://en.wikipedia.org/wiki/CAP_theorem');
    expect(hits[0]?.extract).toMatch(/partitions/);
  });

  it('still answers MVC from the lesson when no web lookup is needed', () => {
    const turn = prepareTurn('analogy for MVC');
    expect(needsWeb('analogy for MVC', turn.inScope)).toBe(false);
    expect(turn.sources[0]?.id).toBe('mvc-to-react');
  });
});
