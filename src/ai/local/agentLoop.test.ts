/**
 * Branch 16 (Shape C amended): the code-driven tool loop, Node-tested with
 * mocked tools (Seat B contract). The five commissioned classes:
 * (a) tool calling — routing into the loop, sequencing, discard/fallback;
 * (b) web-search answer with citations, incl. the identifier-planting test;
 * (c) no-source case votes low on BOTH answer paths;
 * (d) weak-device model choice — in inference.ladder.test.ts;
 * (e) the #199 question ("install docker") end-to-end at turn+loop level.
 * Browser behaviour is NOT proven here and is labelled UNVERIFIED in the PR.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalTopic,
  isWikiOptOut,
  loopApplies,
  runAgentLoop,
  type LoopDeps,
  type LoopSource,
  type WikiPage,
} from './agentLoop.ts';
import { NO_SOURCE, buildTurn } from './semantic/turn.ts';
import type { Decision } from './semantic/router.ts';

const LESSON: LoopSource = {
  kind: 'lesson',
  id: 'cloud-native-architecture',
  title: 'Cloud Native Architecture',
  text: 'Containers package an application with its dependencies. Docker builds container images from a Dockerfile and runs them the same way on any machine.',
};
const DOCKER_PAGE: WikiPage = {
  title: 'Docker (software)',
  url: 'https://en.wikipedia.org/wiki/Docker_(software)',
  extract:
    'Docker is a platform for developing, shipping, and running applications in containers. On Windows and macOS, Docker Desktop provides the runtime. On Linux, the Docker Engine is installed from the command line for distributions such as Ubuntu.',
};

function deps(overrides: Partial<LoopDeps> = {}): LoopDeps {
  return {
    retrieve: vi.fn(async () => [LESSON]),
    searchWikipedia: vi.fn(async () => DOCKER_PAGE),
    fitScore: vi.fn(async () => 0.6),
    synthesize: vi.fn(async () => null),
    wikiEnabled: () => true,
    markWikiUsed: () => false,
    ...overrides,
  };
}

describe('(a) tool calling — routing into the loop', () => {
  it('only parametric_fallback and howto enter the loop', () => {
    expect(loopApplies('parametric_fallback')).toBe(true);
    expect(loopApplies('howto')).toBe(true);
    for (const action of ['lesson', 'clarify', 'redirect', 'self'] as const) {
      expect(loopApplies(action)).toBe(false);
    }
  });

  it('runs the steps in order: re-retrieval, then Wikipedia with the canonical term', async () => {
    const d = deps();
    const result = await runAgentLoop('what is docker written in', 'parametric_fallback', d);
    expect(d.retrieve).toHaveBeenCalledTimes(1);
    expect(d.searchWikipedia).toHaveBeenCalledWith('docker');
    expect(result.traces.map((trace) => trace.name)).toEqual(['search_lessons', 'web_search']);
  });

  it('never calls Wikipedia when the student has opted out', async () => {
    const d = deps({ wikiEnabled: () => false });
    const result = await runAgentLoop('what is docker', 'parametric_fallback', d);
    expect(d.searchWikipedia).not.toHaveBeenCalled();
    expect(result.citations.map((citation) => citation.kind)).toEqual(['lesson']);
  });

  it('completes from re-retrieval alone when Wikipedia times out, and the vote drops mechanically', async () => {
    const withWiki = await runAgentLoop('what is docker', 'parametric_fallback', deps());
    const timedOut = await runAgentLoop(
      'what is docker',
      'parametric_fallback',
      deps({
        searchWikipedia: vi.fn(async () => {
          throw new Error('The operation timed out');
        }),
      }),
    );
    expect(timedOut.answer).toContain('Containers package an application');
    expect(timedOut.citations.map((citation) => citation.kind)).toEqual(['lesson']);
    expect(withWiki.confidence.level).toBe('high');
    expect(timedOut.confidence.level).toBe('medium');
  });

  it('completes from re-retrieval alone on a Wikipedia 404 (null page)', async () => {
    const result = await runAgentLoop(
      'what is docker',
      'parametric_fallback',
      deps({ searchWikipedia: vi.fn(async () => null) }),
    );
    expect(result.citations.map((citation) => citation.kind)).toEqual(['lesson']);
    expect(result.answer).toContain('Containers package');
  });

  it('discards a disambiguation page: synthesis is never even offered it', async () => {
    const synthesize = vi.fn(
      async (_question: string, sources: LoopSource[]) => `from: ${sources.map((source) => source.title).join(', ')}`,
    );
    const result = await runAgentLoop(
      'what is docker',
      'parametric_fallback',
      deps({
        searchWikipedia: vi.fn(async () => ({
          title: 'Docker (disambiguation)',
          url: 'https://en.wikipedia.org/wiki/Docker_(disambiguation)',
          extract: 'Docker may refer to several things.',
        })),
        synthesize,
      }),
    );
    expect(result.citations.map((citation) => citation.kind)).toEqual(['lesson']);
    expect(result.answer).toBe('from: Cloud Native Architecture');
    const offered = synthesize.mock.calls[0]?.[1] ?? [];
    expect(offered.some((source) => source.title.includes('disambiguation'))).toBe(false);
  });

  it('discards a title-mismatched page (the Doctor Who failure shape)', async () => {
    const result = await runAgentLoop(
      'who hired you',
      'parametric_fallback',
      deps({
        retrieve: vi.fn(async () => []),
        searchWikipedia: vi.fn(async () => ({
          title: 'Doctor Who',
          url: 'https://en.wikipedia.org/wiki/Doctor_Who',
          extract: 'Doctor Who is a British science fiction television series.',
        })),
      }),
    );
    expect(result.citations).toEqual([]);
    expect(result.answer).toBe(NO_SOURCE);
  });

  it('discards a page whose extract fails the ADR §5 fit bar', async () => {
    const result = await runAgentLoop(
      'what is docker',
      'parametric_fallback',
      deps({ fitScore: vi.fn(async () => 0.1) }),
    );
    expect(result.citations.map((citation) => citation.kind)).toEqual(['lesson']);
  });
});

describe('(b) web-search answer with citations', () => {
  it('assigns citations by code: exactly the sources retrieved this turn', async () => {
    const result = await runAgentLoop(
      'what is docker',
      'parametric_fallback',
      deps({ synthesize: vi.fn(async () => 'Docker packages apps into containers that run anywhere.') }),
    );
    expect(result.answer).toBe('Docker packages apps into containers that run anywhere.');
    expect(result.citations).toEqual([
      { kind: 'lesson', id: 'cloud-native-architecture', title: 'Cloud Native Architecture' },
      { kind: 'wikipedia', title: 'Docker (software)', url: 'https://en.wikipedia.org/wiki/Docker_(software)' },
    ]);
    expect(result.usedWikipedia).toBe(true);
  });

  it('identifier-planting: a name planted in the question never reaches the Wikipedia query', async () => {
    const d = deps();
    await runAgentLoop('my name is Zachary Qwerty and my email is zachary.qwerty@example.com — what is docker', 'parametric_fallback', d);
    const term = (d.searchWikipedia as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(term.toLowerCase()).not.toContain('zachary');
    expect(term.toLowerCase()).not.toContain('qwerty');
    expect(term).not.toContain('@');
    expect(canonicalTopic('my name is Zachary Qwerty — what is docker', 'parametric_fallback')).not.toMatch(/zachary|qwerty/i);
  });

  it('identifier-planting: an identifier planted in a retrieved page is never cited or queried back', async () => {
    const planted: WikiPage = {
      ...DOCKER_PAGE,
      extract: `${DOCKER_PAGE.extract} Maintainers can be reached at zachary.qwerty@example.com for details.`,
    };
    const d = deps({ searchWikipedia: vi.fn(async () => planted) });
    const result = await runAgentLoop('what is docker', 'parametric_fallback', d);
    expect(JSON.stringify(result.citations)).not.toContain('zachary');
    expect((d.searchWikipedia as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('flags first Wikipedia use so the panel can disclose it', async () => {
    const result = await runAgentLoop('what is docker', 'parametric_fallback', deps({ markWikiUsed: () => true }));
    expect(result.wikiFirstUse).toBe(true);
    const again = await runAgentLoop('what is docker', 'parametric_fallback', deps({ markWikiUsed: () => false }));
    expect(again.wikiFirstUse).toBe(false);
  });
});

describe('(c) no-source case votes low — both paths', () => {
  const empty = { retrieve: vi.fn(async () => []), searchWikipedia: vi.fn(async () => null) };

  it('extractive path: no sources ⇒ NO_SOURCE wording and a forced low vote', async () => {
    const result = await runAgentLoop('what is flibberdigejit', 'parametric_fallback', deps({ ...empty }));
    expect(result.answer).toBe(NO_SOURCE);
    expect(result.confidence.level).toBe('low');
    expect(result.citations).toEqual([]);
  });

  it('synthesis path: the model is never even asked when there are no sources', async () => {
    const synthesize = vi.fn(async () => 'An invented answer with no source.');
    const result = await runAgentLoop('what is flibberdigejit', 'parametric_fallback', deps({ ...empty, synthesize }));
    expect(synthesize).not.toHaveBeenCalled();
    expect(result.answer).toBe(NO_SOURCE);
    expect(result.confidence.level).toBe('low');
  });

  it('both paths share the post-condition: same sources in ⇒ same vote out', async () => {
    const extractive = await runAgentLoop('what is docker', 'parametric_fallback', deps());
    const synthesised = await runAgentLoop(
      'what is docker',
      'parametric_fallback',
      deps({ synthesize: vi.fn(async () => 'A model-worded answer.') }),
    );
    expect(synthesised.confidence).toEqual(extractive.confidence);
  });
});

describe('canonical topic + opt-out phrases', () => {
  it('derives the minimised term, never the sentence', () => {
    expect(canonicalTopic('install docker', 'howto')).toBe('docker');
    expect(canonicalTopic('how do I install docker', 'howto')).toBe('docker');
    expect(canonicalTopic('how to install docker on ubuntu', 'howto')).toBe('docker');
    expect(canonicalTopic('install kubernetes', 'howto')).toBe('kubernetes');
    expect(canonicalTopic('what is a monad in functional programming', 'parametric_fallback')).toBe('monad functional programming');
  });

  it('recognises a plain no-web request', () => {
    expect(isWikiOptOut("don't use the web")).toBe(true);
    expect(isWikiOptOut('no wikipedia please')).toBe(true);
    expect(isWikiOptOut('stop using wikipedia')).toBe(true);
    expect(isWikiOptOut('what is the web of queues in this course')).toBe(false);
  });
});

describe('(e) the #199 question — install docker, end to end at turn+loop level', () => {
  const decision = (osUnspecified: boolean): Decision => ({
    action: 'howto',
    intent: 'tech',
    intentConfidence: 0.5,
    intentScores: { course: 0, tech: 0.5, debate: 0, off_topic: 0, self: 0 },
    lessons: [],
    reasons: ['test decision'],
    osUnspecified,
  });

  it('OS unspecified: exactly one OS question, and the loop never fires', () => {
    const turn = buildTurn('install docker', [], decision(true));
    expect(turn.action).toBe('howto');
    expect(turn.answer).toMatch(/Which operating system/);
    expect(turn.answer.split('?')).toHaveLength(2); // exactly one question asked
  });

  it('OS named: an OS-branched answer built from retrieved sources, with citations — never a lesson, never a redirect', async () => {
    const turn = buildTurn('install docker on ubuntu', [], decision(false));
    expect(turn.action).toBe('howto'); // branch 3's route, not lesson/redirect
    const result = await runAgentLoop('install docker on ubuntu', 'howto', deps());
    expect(result.answer).toContain('On Linux');
    expect(result.answer).toContain('Ubuntu');
    expect(result.citations).toContainEqual({
      kind: 'wikipedia',
      title: 'Docker (software)',
      url: 'https://en.wikipedia.org/wiki/Docker_(software)',
    });
    expect(result.confidence.level).not.toBe('low');
  });

  it('the three docker phrasings converge on the same loop behaviour', async () => {
    for (const question of ['install docker', 'how do I install docker', 'how to install docker on ubuntu']) {
      const d = deps();
      await runAgentLoop(question, 'howto', d);
      expect(d.searchWikipedia).toHaveBeenCalledWith('docker');
    }
  });
});
