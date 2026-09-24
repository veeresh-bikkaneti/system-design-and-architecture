import { describe, expect, it } from 'vitest';
import { needsWeb, prepareTurn } from './agent.ts';
import { grounding, spokenWeb, webAside, webQuery, wikiPageUrl, wikiSearchUrl, searchWeb, type WebHit } from './web.ts';

const java: WebHit = {
  title: 'Java (programming language)',
  url: 'https://en.wikipedia.org/wiki/Java_(programming_language)',
  extract: 'Java is a high-level programming language. It runs on a virtual machine.',
};

describe('web tool', () => {
  it('searches the web for course questions and short definitions, not debates', () => {
    expect(needsWeb('what is java', false)).toBe(true);
    expect(needsWeb('what is C#', false)).toBe(true);
    expect(needsWeb('analogy for MVC', true)).toBe(true);
    expect(needsWeb('Should we study science in Catholic schools?', false)).toBe(false);
    expect(needsWeb('Write a poem about my cat', false)).toBe(false);
    expect(needsWeb('who are you', false)).toBe(false);
  });

  it('sends java and C# to the programming-language pages', () => {
    expect(webQuery('what is java')).toBe('Java (programming language)');
    expect(webQuery('what is C#')).toBe('C Sharp (programming language)');
    expect(webQuery('what is playwright')).toBe('Playwright (software)');
    expect(grounding({ aboutMe: false, inScope: false, citedWeb: true }).level).toBe('medium');
    expect(grounding({ aboutMe: false, inScope: false, citedWeb: false }).level).toBe('low');
    expect(grounding({ aboutMe: false, inScope: true, citedWeb: true }).level).toBe('high');
    expect(grounding({ aboutMe: false, inScope: false, citedWeb: false, offCourse: true }).label).toMatch(/Off topic/);
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
      if (href.includes('/page/summary/')) {
        return new Response(
          JSON.stringify({
            title: 'CAP theorem',
            extract: 'CAP is a theorem. It is about partitions.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/CAP_theorem' } },
          }),
        );
      }
      return new Response(JSON.stringify({ query: { search: [] } }));
    }) as typeof fetch;
    const hits = await searchWeb('CAP theorem', fetchImpl);
    expect(hits[0]?.title).toBe('CAP theorem');
    expect(hits[0]?.url).toBe('https://en.wikipedia.org/wiki/CAP_theorem');
    expect(hits[0]?.extract).toMatch(/partitions/);
  });

  it('still answers MVC from the lesson when no web lookup is needed', () => {
    const turn = prepareTurn('analogy for MVC');
    expect(needsWeb('analogy for MVC', turn.inScope)).toBe(true);
    expect(turn.sources[0]?.id).toBe('mvc-to-react');
  });
});
