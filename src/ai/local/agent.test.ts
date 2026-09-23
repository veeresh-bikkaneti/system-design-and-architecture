import { describe, expect, it } from 'vitest';
import { OKF_CARDS } from './cards.ts';
import { prepareTurn } from './agent.ts';
import { searchCards } from './retrieve.ts';

describe('local OKF tutor', () => {
  it('lands a CAP question on the CAP lesson', () => {
    const hits = searchCards('what is the CAP theorem during a partition', OKF_CARDS, 3);
    expect(hits[0]?.card.id).toBe('cap-theorem');
  });

  it('pins the LangChain guide for tool-calling questions', () => {
    const turn = prepareTurn('How does LangChain tool calling work with bind_tools?');
    expect(turn.inScope).toBe(true);
    expect(turn.sources.some((source) => source.id === 'langchain-tool-calling')).toBe(true);
    expect(turn.traces.map((trace) => trace.name)).toEqual(['search_lessons', 'read_concept']);
  });

  it('opens the OKF guide', () => {
    const turn = prepareTurn('What is OKF and why is the context markdown?');
    expect(turn.sources.some((source) => source.id === 'okf')).toBe(true);
    expect(turn.answer).toMatch(/Open Knowledge Format/);
  });

  it('declines off-topic questions', () => {
    const turn = prepareTurn('Write a poem about my cat named Miso');
    expect(turn.inScope).toBe(false);
    expect(turn.sources).toEqual([]);
  });

  it('reuses the previous question for a short follow-up', () => {
    const turn = prepareTurn('give an example', [
      { role: 'user', content: 'Explain the token bucket for rate limiting' },
      { role: 'assistant', content: 'Tokens drip in.' },
    ]);
    expect(turn.sources.some((source) => source.id === 'rate-limiting')).toBe(true);
  });
});
