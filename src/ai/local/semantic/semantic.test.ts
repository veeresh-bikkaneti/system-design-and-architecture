import { describe, expect, it } from 'vitest';
import { encodeVectors } from '../../../../scripts/ben/build-index.mjs';
import { OFF_COURSE } from '../agent.ts';
import { decodeVectors, dot, normalize, type BenIndex, type Intent, type LessonChunk } from './codec.ts';
import { namedLessons, namedTagLessons, route, THRESHOLDS } from './router.ts';
import { buildTurn, NO_SOURCE, sectionLead } from './turn.ts';

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
    expect(namedLessons('DDD')).toContain('domain-driven-design');
  });

  it('treats a unique single-token tag as a named lesson, including Guides', () => {
    expect(namedTagLessons('DDD')).toContain('domain-driven-design');
    expect(namedTagLessons('tell me about local AI')).toContain('tutor-loop');
    expect(namedTagLessons('how to setup local AI')).toContain('tutor-loop');
    expect(namedTagLessons('hmm that thing with the two sides')).toEqual([]);
    expect(namedTagLessons('backend for frontend pattern')).toEqual([]);
    expect(namedTagLessons('why does my replica show old data')).toEqual([]);
  });

  it('pins DDD over a competing Anti-Corruption Layer chunk that already clears 0.45', () => {
    const competing: BenIndex = {
      ...index,
      chunks: [chunk('anti-corruption-layer', 5), chunk('domain-driven-design', 6)],
    };
    const decision = route({ question: 'DDD', vector: vec(5, [0.6]), index: competing });
    expect(decision.action).toBe('lesson');
    expect(decision.lessons[0]?.slug).toBe('domain-driven-design');
    expect(decision.pinned).toEqual(['domain-driven-design']);
    const turn = buildTurn('DDD', [], decision);
    expect(turn.sources.map((source) => source.id)).toEqual(['domain-driven-design']);
    expect(turn.confidence.level).toBe('high');
    expect(decision.lessons[0]?.best).toBeLessThan(0.55);
  });

  it('pins the tutor-loop Guide over a competing Designing AI Systems chunk', () => {
    const competing: BenIndex = {
      ...index,
      chunks: [chunk('designing-ai-systems', 5)],
    };
    const decision = route({ question: 'tell me about local AI', vector: vec(5, [0.6]), index: competing });
    expect(decision.action).toBe('lesson');
    expect(decision.lessons[0]?.slug).toBe('tutor-loop');
    expect(decision.pinned).toEqual(['tutor-loop']);
    const turn = buildTurn('tell me about local AI', [], decision);
    expect(turn.sources.map((source) => source.id)).toEqual(['tutor-loop']);
    expect(turn.answer).toMatch(/WebLLM|Prompt API/i);
    expect(turn.answer).not.toMatch(/Chrome's Prompt API/);
    expect(turn.confidence.level).toBe('high');
    expect(turn.confidence.label).toMatch(/How this tutor runs/);
    expect(turn.context).toBe('');
  });

  it('answers how to setup local AI with the browser-neutral setup sentence', () => {
    const competing: BenIndex = {
      ...index,
      chunks: [chunk('designing-ai-systems', 5)],
    };
    const decision = route({ question: 'how to setup local AI', vector: vec(5, [0.6]), index: competing });
    expect(decision.lessons[0]?.slug).toBe('tutor-loop');
    expect(decision.pinned).toEqual(['tutor-loop']);
    const turn = buildTurn('how to setup local AI', [], decision);
    expect(turn.sources.map((source) => source.id)).toEqual(['tutor-loop']);
    expect(turn.answer).toMatch(/WebLLM|Prompt API/i);
    expect(turn.answer).not.toMatch(/The course site is static/);
    expect(turn.answer).not.toMatch(/Chrome's Prompt API/);
    expect(turn.confidence.level).toBe('high');
    expect(turn.confidence.label).toBe('High confidence · from How this tutor runs');
    expect(turn.context).toBe('');
  });

  it('pins the four-token set-up phrasing to tutor-loop', () => {
    expect(namedTagLessons('how to set up local AI')).toEqual(['tutor-loop']);
    const competing: BenIndex = {
      ...index,
      chunks: [chunk('designing-ai-systems', 5)],
    };
    const decision = route({ question: 'how to set up local AI', vector: vec(5, [0.6]), index: competing });
    expect(decision.action).toBe('lesson');
    expect(decision.lessons[0]?.slug).toBe('tutor-loop');
    expect(decision.pinned).toEqual(['tutor-loop']);
    const turn = buildTurn('how to set up local AI', [], decision);
    expect(turn.sources.map((source) => source.id)).toEqual(['tutor-loop']);
    expect(turn.answer).toMatch(/WebLLM|Prompt API/i);
    expect(turn.answer).not.toMatch(/Chrome's Prompt API/);
    expect(turn.answer).not.toMatch(/narrow and careful/);
    expect(turn.confidence.level).toBe('high');
    expect(turn.confidence.label).toBe('High confidence · from How this tutor runs');
    expect(turn.context).toBe('');
  });

  it('does not pin tutor-loop for unrelated set-up questions', () => {
    expect(namedTagLessons('how to set up postgres')).toEqual([]);
    expect(namedTagLessons('how to set up local redis')).toEqual([]);
  });

  // "My AI env" with no other clue is read as Ben's own setup: that is the
  // live report. Python, venv, CUDA, conda, pip, "dev environment", "my
  // machine" or "my project" mean the student's own box, which Ben can't see.
  it.each([
    'I want to setup my ai env can you help',
    'help me set up my AI environment',
    'how do I set up the ai env',
    'setup ai env',
    'can you help me get the ai set up',
    'I want to set up my ai env',
    'can you help me get the ai setup',
  ])('pins "%s" to tutor-loop with the setup answer', (question) => {
    expect(namedTagLessons(question)).toEqual(['tutor-loop']);
    const competing: BenIndex = {
      ...index,
      chunks: [chunk('designing-ai-systems', 5)],
    };
    const decision = route({ question, vector: vec(5, [0.6]), index: competing });
    expect(decision.action).toBe('lesson');
    expect(decision.lessons[0]?.slug).toBe('tutor-loop');
    expect(decision.pinned).toEqual(['tutor-loop']);
    const turn = buildTurn(question, [], decision);
    expect(turn.sources.map((source) => source.id)).toEqual(['tutor-loop']);
    expect(turn.answer).toMatch(/WebLLM|Prompt API/i);
    expect(turn.answer).not.toMatch(/narrow and careful/);
    expect(turn.confidence.level).toBe('high');
    expect(turn.confidence.label).toBe('High confidence · from How this tutor runs');
  });

  it.each([
    // Each of these says "set up ... ai env", so only the own-machine /
    // vendor / noun checks keep them off tutor-loop.
    'set up my python ai env with venv and CUDA',
    'set up my ai env with pip',
    'set up my ai env on my machine',
    'set up my ai env in docker',
    'set up my ai env on my laptop',
    'setup ai environment variables for the API',
    'set up my open ai env',
    'set up azure ai environment',
    'install pipenv for my ai env',
    'what is the ai setup netflix uses',
    'what is the ai set up netflix uses',
  ])('does not pin tutor-loop for own-environment "%s"', (question) => {
    expect(namedTagLessons(question)).not.toContain('tutor-loop');
    const decision = route({ question, vector: vec(1), index });
    expect(decision.pinned).toBeUndefined();
    expect(decision.action).toBe('parametric_fallback');
  });

  // The embedding vote can land on off_topic for a setup phrasing. The pin
  // must still win, or Ben shrugs at someone asking how to switch him on.
  it.each([
    'help me setup the tutor',
    'how do I set up the tutor',
    'can you help me set up Ben',
    'help me set up local AI',
  ])('pins "%s" to tutor-loop even when the vote is off_topic', (question) => {
    const decision = route({ question, vector: vec(3), index });
    expect(decision.intent).toBe('off_topic');
    expect(decision.action).toBe('lesson');
    expect(decision.pinned).toEqual(['tutor-loop']);
    expect(decision.lessons[0]?.slug).toBe('tutor-loop');
  });

  it.each([
    'how do I set up a tutor business',
    'set up a tutor for math lessons near me',
    'install ben franklin biography',
    'ben setup meme',
    'setup local ai on my gpu',
    'set up my netflix account',
    'set up my smart tv',
    'setup the tutor for my kid homework',
    'install ben 10 game',
    "set up ben and jerry's account",
    'install ben affleck fan page',
    "set up ben's birthday party",
    'install ben.exe on windows',
  ])('does not pin tutor-loop for look-alike "%s" under an off_topic vote', (question) => {
    const decision = route({ question, vector: vec(3), index });
    expect(decision.pinned).toBeUndefined();
    expect(decision.action).toBe('redirect');
  });

  it.each([
    'set up Ben please',
    'install Ben please',
    'install Ben',
    'setup the tutor at school',
    'set up the tutor for my school computer lab',
    'set up the tutor for homework help',
    'how do I install local AI at school',
  ])(
    'pins tutor-loop for "%s" under an off_topic vote',
    (question) => {
      const decision = route({ question, vector: vec(3), index });
      expect(decision.pinned).toEqual(['tutor-loop']);
    },
  );

  it.each(['who is Tom Hanks', 'what is the capital of France'])(
    'still redirects off-topic "%s"',
    (question) => {
      const decision = route({ question, vector: vec(3), index });
      expect(decision.action).toBe('redirect');
      expect(decision.pinned).toBeUndefined();
    },
  );

  it.each(['set up my python venv with CUDA', 'set up my ai env with pip'])(
    'leaves own-environment "%s" unpinned under an off_topic vote',
    (question) => {
      const decision = route({ question, vector: vec(3), index });
      expect(decision.pinned).toBeUndefined();
      expect(decision.action).toBe('redirect');
    },
  );

  it('still pins a DDD question to domain-driven-design', () => {
    const decision = route({ question: 'DDD', vector: vec(0), index });
    expect(decision.pinned).toEqual(['domain-driven-design']);
  });
});

// D2a (docs/manifests/ben-router-generalization.md): the clarify band and the self vote.
// Written first; the "decisive" tests are RED until router.ts changes. The "split" and
// "guard" tests pass today and must keep passing: they stop the fix from over-reaching.
describe('router: clarify band and self vote (D2a)', () => {
  const weakCourse = normalize(Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0.9]));

  it('precondition: the weak vector lands inside the clarify band with a unanimous course vote', () => {
    const decision = route({ question: 'hmm that thing with the two sides', vector: weakCourse, index });
    expect(decision.intent).toBe('course');
    expect(decision.intentConfidence).toBeGreaterThanOrEqual(0.7);
    expect(decision.lessons[0]?.best).toBeGreaterThanOrEqual(THRESHOLDS.clarify);
    expect(decision.lessons[0]?.best).toBeLessThan(THRESHOLDS.lesson);
  });

  it('answers from the closest lesson when the course vote is decisive inside the clarify band', () => {
    const decision = route({ question: 'hmm that thing with the two sides', vector: weakCourse, index });
    expect(decision.action).toBe('lesson');
    expect(decision.lessons[0]?.slug).toBeDefined();
  });

  it('still clarifies inside the band when the course vote is only a plurality', () => {
    // course 0.6 vs off_topic 0.4: a lexical false friend ("raft", "tokens"), not a course question.
    const split = normalize(Float32Array.from([0.7, 0, 0, 0.57, 0, 0, 0, 0.43]));
    const decision = route({ question: 'hmm that thing with the two sides', vector: split, index });
    expect(decision.intent).toBe('course');
    expect(decision.intentConfidence).toBeLessThan(0.7);
    expect(decision.lessons[0]?.best).toBeGreaterThanOrEqual(THRESHOLDS.clarify);
    expect(decision.lessons[0]?.best).toBeLessThan(THRESHOLDS.lesson);
    expect(decision.action).toBe('clarify');
  });

  it('still redirects below the clarify gate even when the course vote is unanimous', () => {
    const far = normalize(Float32Array.from([1, 0, 0, 0, 0, 0, 0, 6]));
    const decision = route({ question: 'hmm that thing with the two sides', vector: far, index });
    expect(decision.lessons[0]?.best).toBeLessThan(THRESHOLDS.clarify);
    expect(decision.action).toBe('redirect');
  });

  it('routes a decisive self vote to Ben when the question addresses him and no lesson is close', () => {
    const decision = route({ question: 'will you keep track of what we covered last week', vector: vec(4), index });
    expect(decision.action).toBe('self');
  });

  it('does not route a self vote below 0.8 to Ben', () => {
    // self 0.75 vs off_topic 0.25
    const mixed = normalize(Float32Array.from([0, 0, 0, 0.408, 1, 0, 0, 0]));
    const decision = route({ question: 'will you keep track of what we covered last week', vector: mixed, index });
    expect(decision.intent).toBe('self');
    expect(decision.intentConfidence).toBeLessThan(0.8);
    expect(decision.action).not.toBe('self');
  });

  it('never routes a decisive self vote to Ben when the question does not address him', () => {
    // The "who is <actor>" drift bug: same vector as the test above, no second person.
    const decision = route({ question: 'Who is Michael Keaton', vector: vec(4), index });
    expect(decision.action).not.toBe('self');
  });

  it('lets a named-tag pin and a blocked topic outrank both new rules', () => {
    expect(route({ question: 'DDD', vector: weakCourse, index }).pinned).toEqual(['domain-driven-design']);
    expect(route({ question: 'is faith compatible with caching', vector: weakCourse, index }).action).toBe('redirect');
  });
});

describe('turn', () => {
  it('keeps a parametric turn even when no lesson ranked', () => {
    const turn = buildTurn('what is amazon', [], {
      action: 'parametric_fallback',
      intent: 'tech',
      intentConfidence: 1,
      intentScores: { course: 0, tech: 1, debate: 0, off_topic: 0, self: 0 },
      lessons: [],
      reasons: ['general tech, no lesson covers it'],
    });
    expect(turn.action).toBe('parametric_fallback');
    expect(turn.answer).toBe(NO_SOURCE);
  });

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
