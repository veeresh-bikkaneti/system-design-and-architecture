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

  it('answers a one-word lesson name and runs both tools', () => {
    const turn = prepareTurn('MVC');
    expect(turn.inScope).toBe(true);
    expect(turn.sources[0]?.id).toBe('mvc-to-react');
    expect(turn.answer).toMatch(/Model/);
    expect(turn.traces.map((trace) => trace.name)).toEqual(['search_lessons', 'read_concept']);
  });

  it('answers the plain-English name of MVC', () => {
    const turn = prepareTurn('what is model view controller?');
    expect(turn.inScope).toBe(true);
    expect(turn.sources.some((source) => source.id === 'mvc-to-react')).toBe(true);
  });

  it('reads the lesson open on the page when the question is "explain this"', () => {
    const turn = prepareTurn('explain this', [], 'mvc-to-react');
    expect(turn.inScope).toBe(true);
    expect(turn.sources[0]?.id).toBe('mvc-to-react');
    expect(turn.traces.some((trace) => trace.name === 'read_concept')).toBe(true);
  });

  it('does not let the open lesson hide a different named topic', () => {
    const turn = prepareTurn('what is the CAP theorem', [], 'mvc-to-react');
    expect(turn.sources[0]?.id).toBe('cap-theorem');
  });
  it('introduces itself when the greeting is misspelled', () => {
    const turn = prepareTurn('who ar eyou');
    expect(turn.inScope).toBe(true);
    expect(turn.answer).toMatch(/Ben/);
    expect(turn.answer).toMatch(/tutor/i);
    expect(turn.answer).not.toMatch(/don't have a lesson/i);
  });

  it('answers an analogy with the picture, not the whole lesson', () => {
    const turn = prepareTurn('analogy for MVC');
    expect(turn.sources[0]?.id).toBe('mvc-to-react');
    expect(turn.answer).toMatch(/diner/i);
    expect(turn.answer).not.toMatch(/MVP and MVVM/);
  });

  it('a follow-up asking for examples is not a repeat of the analogy', () => {
    const first = prepareTurn('analogy for MVC');
    const second = prepareTurn('explain with examples', [
      { role: 'user', content: 'analogy for MVC' },
      { role: 'assistant', content: first.answer },
    ]);
    expect(second.sources[0]?.id).toBe('mvc-to-react');
    expect(second.answer).toMatch(/Buy milk/);
    expect(second.answer).not.toBe(first.answer);
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
