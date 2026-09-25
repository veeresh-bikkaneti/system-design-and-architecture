import { describe, expect, it } from 'vitest';
import { encodeVectors } from '../../../../scripts/ben/build-index.mjs';
import { OFF_COURSE } from '../agent.ts';
import { decodeVectors, dot, normalize, type BenIndex, type Intent, type LessonChunk } from './codec.ts';
import { namedLessons, route, THRESHOLDS } from './router.ts';
import { buildTurn, sectionLead } from './turn.ts';

/** Unit vector pointing mostly along `axis` in a small space, nudged by `tilt`. */
function vec(axis: number, tilt: number[] = []): Float32Array {
  const v = new Float32Array(8);
  v[axis] = 1;
  tilt.forEach((value, i) => {
    v[i] = (v[i] ?? 0) + value;
  });
  return normalize(v);
}

// Axes: 0 course, 1 tech, 2 debate, 3 off_topic, 4 self, 5 CAP, 6 caching, 7 spare.
function chunk(slug: string, axis: number, heading = 'Why this matters'): LessonChunk {
  return {
    id: `${slug}#0`,
    slug,
    heading,
    text: 'During a partition you must choose. Consistency means refusing some requests. Availability means answering with what you have.',
    vector: vec(axis, [0.6]),
  };
}

const index: BenIndex = {
  content: 'test',
  dims: 8,
  chunks: [chunk('cap-theorem', 5), chunk('caching-strategies', 6)],
  examples: (
    [
      ['course', 0],
      ['course', 0],
      ['tech', 1],
      ['tech', 1],
      ['debate', 2],
      ['debate', 2],
      ['off_topic', 3],
      ['off_topic', 3],
      ['self', 4],
    ] as [Intent, number][]
  ).map(([intent, axis]) => ({ intent, vector: vec(axis) })),
};

describe('codec', () => {
  it('round-trips int8 vectors within quantization error', () => {
    const rows = [Array.from(vec(2, [0.3, -0.2])), Array.from(vec(5, [0.1]))];
    const encoded = encodeVectors(rows);
    const decoded = decodeVectors(encoded, 8);
    rows.forEach((row, i) => {
      expect(dot(Float32Array.from(row), decoded[i] as Float32Array)).toBeGreaterThan(0.999);
    });
  });

  it('rejects an index whose byte count does not match its rows', () => {
    expect(() => decodeVectors({ data: 'AAAA', scales: [1, 1] }, 8)).toThrow(/expected 16 bytes/);
  });
});

describe('router', () => {
  it('redirects a debate even when its words overlap a lesson', () => {
    const decision = route({ question: 'Should schools teach this?', vector: vec(2, [0, 0, 0, 0, 0, 0.4]), index });
    expect(decision.intent).toBe('debate');
    expect(decision.action).toBe('redirect');
  });

  it('answers a course question from the closest lesson', () => {
    const decision = route({ question: 'what happens during a partition', vector: vec(5, [0.6]), index });
    expect(decision.action).toBe('lesson');
    expect(decision.lessons[0]?.slug).toBe('cap-theorem');
  });

  it('answers a tech-sounding question from a lesson when a lesson covers it', () => {
    const decision = route({ question: 'what is caching', vector: vec(6, [0.3, 0.9]), index });
    expect(decision.intent).toBe('tech');
    expect(decision.action).toBe('lesson');
  });

  it('falls back to the model\'s own knowledge for general tech that no lesson covers', () => {
    const decision = route({ question: 'what is golang', vector: vec(1), index });
    expect(decision.action).toBe('parametric_fallback');
  });

  it('offers the closest lessons instead of guessing on a weak match', () => {
    const weak = normalize(Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0.9]));
    const decision = route({ question: 'hmm that thing with the two sides', vector: weak, index });
    expect(decision.lessons[0]?.best).toBeLessThan(THRESHOLDS.lesson);
    expect(decision.action).toBe('clarify');
  });

  it('keeps the blocked-topic guard rail', () => {
    const decision = route({ question: 'is faith compatible with caching', vector: vec(6, [0.6]), index });
    expect(decision.action).toBe('redirect');
  });

  it('answers questions about Ben as Ben', () => {
    expect(route({ question: 'who hired you', vector: vec(0), index }).action).toBe('self');
  });

  it('does not answer as Ben just because the vote embeds near the self examples', () => {
    // A question about an unrelated named person can embed close to "who are
    // you"-style exemplars on nearest-neighbor grounds alone. Without the
    // rule layer's agreement (isAboutTutor), that vote must not be trusted --
    // Ben has no idea who this is, and should say so is outside the course,
    // not answer as if he were asked about himself.
    const decision = route({ question: 'Who is Michael Keaton', vector: vec(4), index });
    expect(decision.intent).toBe('self');
    expect(decision.action).not.toBe('self');
  });

  it('lets a confident off-topic vote veto the about-Ben rule', () => {
    const decision = route({ question: 'Is it okay to lie to your boss?', vector: vec(2), index });
    expect(decision.action).toBe('redirect');
  });

  it('reads the open lesson for "explain this"', () => {
    const decision = route({ question: 'explain this', focusId: 'caching-strategies', vector: vec(3), index });
    expect(decision.action).toBe('lesson');
    expect(decision.lessons[0]?.slug).toBe('caching-strategies');
  });

  it('boosts a lesson the student names outright', () => {
    expect(namedLessons('what is MVC')).toContain('mvc-to-react');
    expect(namedLessons('how does raft work')).toContain('consensus-raft');
  });
});

describe('turn', () => {
  it('redirects without citing anything', () => {
    const decision = route({ question: 'Is it wrong to eat meat?', vector: vec(2), index });
    const turn = buildTurn('Is it wrong to eat meat?', [], decision);
    expect(turn.answer).toBe(OFF_COURSE);
    expect(turn.sources).toEqual([]);
    expect(turn.context).toBe('');
    expect(turn.confidence.label).toMatch(/Off topic/);
  });

  it('answers from the best section and cites the lesson', () => {
    const decision = route({ question: 'what happens during a partition', vector: vec(5, [0.6]), index });
    const turn = buildTurn('what happens during a partition', [], decision);
    expect(turn.answer).toMatch(/During a partition you must choose/);
    expect(turn.sources[0]?.id).toBe('cap-theorem');
    expect(turn.context).toMatch(/section "Why this matters"/);
  });

  it('offers lessons on a weak match without answering from them', () => {
    const weak = normalize(Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0.9]));
    const decision = route({ question: 'that two sides thing', vector: weak, index });
    const turn = buildTurn('that two sides thing', [], decision);
    expect(turn.action).toBe('clarify');
    expect(turn.answer).toMatch(/can't tell whether that's about this course/);
    expect(turn.context).toBe('');
  });

  it('cuts a section lead at a sentence boundary', () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} has exactly eight words here.`).join(' ');
    const lead = sectionLead(long);
    expect(lead.endsWith('.')).toBe(true);
    expect(lead.split(/\s+/).length).toBeLessThanOrEqual(72);
  });
});
