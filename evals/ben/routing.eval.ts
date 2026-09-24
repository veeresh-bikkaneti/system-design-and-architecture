/**
 * Scores Ben's routing on the held-out cases in cases.json.
 *
 * Runs the real embedder (scripts/ben/embedder.mjs) and a freshly built index,
 * then compares the semantic router with the legacy keyword pipeline on the
 * same questions. Run with `npm run eval:ben`. Not part of `npm test`: it needs
 * the 23 MB model, which `npm run ben:index` fetches and verifies.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildIndex } from '../../scripts/ben/build-index.mjs';
import { loadNodeEmbedder } from '../../scripts/ben/embedder.mjs';
import { isGeneralTechQuestion, prepareTurn, isAboutTutor, isFollowUp } from '../../src/ai/local/agent.ts';
import { decodeIndex, type BenIndex, type RawBenIndex } from '../../src/ai/local/semantic/codec.ts';
import { queryText, route, type Action } from '../../src/ai/local/semantic/router.ts';
import type { ChatTurn } from '../../src/ai/local/types.ts';

interface Case {
  id: string;
  q: string;
  intent: string;
  action: Action;
  lessons?: string[];
  alsoOk?: Action[];
  history?: ChatTurn[];
  focus?: string;
}

interface Outcome {
  id: string;
  set: string;
  expected: Action;
  got: Action;
  lesson?: string;
  correct: boolean;
  drift: boolean;
  offered: boolean;
  refused: boolean;
}

/** Release gates. Raise them as the example bank grows; never lower them to pass. */
export const GATES = {
  accuracy: 0.85,
  maxDrift: 0.03,
  maxOffered: 0.1,
  maxRefusal: 0.08,
  lessonTop3: 0.9,
};

function load(file: string, set: string): (Case & { set: string })[] {
  return JSON.parse(readFileSync(join(__dirname, file), 'utf8')).cases.map((c: Case) => ({ ...c, set }));
}

/** cases.json drives diagnosis; holdout.json is scored, never tuned against. */
const cases = [...load('cases.json', 'cases'), ...load('holdout.json', 'holdout')];

function judge(c: Case & { set: string }, got: Action, lesson?: string): Outcome {
  const okActions = new Set<Action>([c.action, ...(c.alsoOk ?? [])]);
  let correct = okActions.has(got);
  if (correct && got === 'lesson' && c.lessons) correct = lesson !== undefined && c.lessons.includes(lesson);
  const offCourse = c.action === 'redirect' || c.action === 'self';
  const answered = got === 'lesson' || got === 'parametric_fallback';
  return {
    id: c.id,
    set: c.set,
    expected: c.action,
    got,
    lesson,
    correct,
    // Drift: an off-course or personal question answered as if it were course material.
    drift: offCourse && answered && !okActions.has(got),
    // Offered: Ben declined to answer but suggested lessons ("did you mean...?").
    offered: offCourse && got === 'clarify',
    // Refusal: a question the course should answer, turned away.
    refused: c.action === 'lesson' && got === 'redirect',
  };
}

function legacy(c: Case): { action: Action; lesson?: string } {
  const turn = prepareTurn(c.q, c.history ?? [], c.focus);
  if (isAboutTutor(c.q) || isFollowUp(c.q)) return { action: 'self' };
  if (turn.inScope) return { action: 'lesson', lesson: turn.sources[0]?.id };
  return { action: isGeneralTechQuestion(c.q, false) ? 'parametric_fallback' : 'redirect' };
}

function summarize(name: string, outcomes: Outcome[]) {
  const n = outcomes.length;
  const offCourse = outcomes.filter((o) => o.expected === 'redirect' || o.expected === 'self').length;
  const course = outcomes.filter((o) => o.expected === 'lesson').length;
  return {
    name,
    accuracy: outcomes.filter((o) => o.correct).length / n,
    drift: outcomes.filter((o) => o.drift).length / Math.max(1, offCourse),
    offered: outcomes.filter((o) => o.offered).length / Math.max(1, offCourse),
    refusal: outcomes.filter((o) => o.refused).length / Math.max(1, course),
  };
}

function confusion(outcomes: Outcome[]): string {
  const actions: Action[] = ['lesson', 'clarify', 'parametric_fallback', 'redirect', 'self'];
  const header = `| expected \\ got | ${actions.join(' | ')} |`;
  const rows = actions.map((expected) => {
    const cells = actions.map((got) => outcomes.filter((o) => o.expected === expected && o.got === got).length);
    return `| ${expected} | ${cells.join(' | ')} |`;
  });
  return [header, `|${'---|'.repeat(actions.length + 1)}`, ...rows].join('\n');
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

describe('Ben routing (held-out cases)', () => {
  let index: BenIndex;
  let embed: (texts: string[]) => Promise<number[][]>;
  const semantic: Outcome[] = [];
  const baseline: Outcome[] = [];
  let top1 = 0;
  let top3 = 0;
  let ranked = 0;

  beforeAll(async () => {
    embed = await loadNodeEmbedder();
    const raw = JSON.parse(JSON.stringify(await buildIndex())) as RawBenIndex;
    index = decodeIndex(raw);

    // One question at a time, exactly as the browser embeds it (batching pads and shifts scores).
    const vectors: number[][] = [];
    for (const c of cases) vectors.push(...(await embed([queryText(c.q, c.history ?? [])])));
    cases.forEach((c, i) => {
      const vector = Float32Array.from(vectors[i] ?? []);
      const decision = route({ question: c.q, focusId: c.focus, vector, index });
      semantic.push(judge(c, decision.action, decision.lessons[0]?.slug));
      if (c.action === 'lesson' && c.lessons && !c.focus) {
        ranked += 1;
        const slugs = decision.lessons.map((lesson) => lesson.slug);
        if (c.lessons.includes(slugs[0] ?? '')) top1 += 1;
        if (slugs.slice(0, 3).some((slug) => c.lessons?.includes(slug))) top3 += 1;
      }
      const old = legacy(c);
      baseline.push(judge(c, old.action, old.lesson));
    });

    const rows = (['cases', 'holdout', 'all'] as const).flatMap((set) => {
      const pick = (list: Outcome[]) => (set === 'all' ? list : list.filter((o) => o.set === set));
      return [summarize(`keyword pipeline, ${set}`, pick(baseline)), summarize(`semantic router, ${set}`, pick(semantic))];
    });
    const counts = `${cases.filter((c) => c.set === 'cases').length} diagnosis + ${cases.filter((c) => c.set === 'holdout').length} holdout`;
    const lines = [
      `\n${counts} cases, lesson index ${index.content}. Regenerate with \`npm run eval:ben\`.`,
      '',
      '| pipeline, set | accuracy | drift: off-course answered | off-course, lessons offered | course turned away |',
      '|---|---|---|---|---|',
      ...rows.map((s) => `| ${s.name} | ${pct(s.accuracy)} | ${pct(s.drift)} | ${pct(s.offered)} | ${pct(s.refusal)} |`),
      '',
      `Lesson ranking: top-1 ${pct(top1 / ranked)}, top-3 ${pct(top3 / ranked)} (${ranked} course cases)`,
      '',
      'Semantic router, expected vs got (all cases):',
      confusion(semantic),
      '',
      'Misses:',
      ...semantic
        .filter((o) => !o.correct)
        .map((o) => `- [${o.set}] ${o.id}: expected ${o.expected}, got ${o.got}${o.lesson ? ` (${o.lesson})` : ''}`),
    ];
    // Vitest hides console output when tests pass, so the report is also a file.
    // It is committed: a change to routing shows its metric change in the diff.
    writeFileSync(join(__dirname, 'REPORT.md'), `# Ben routing eval\n${lines.join('\n')}\n`);
    console.log(lines.join('\n'));
  }, 180_000);

  it('beats the keyword pipeline', () => {
    expect(summarize('', semantic).accuracy).toBeGreaterThan(summarize('', baseline).accuracy);
  });

  it(`keeps drift at or below ${pct(GATES.maxDrift)}`, () => {
    expect(summarize('', semantic).drift).toBeLessThanOrEqual(GATES.maxDrift);
  });

  it(`offers lessons for at most ${pct(GATES.maxOffered)} of off-course questions`, () => {
    expect(summarize('', semantic).offered).toBeLessThanOrEqual(GATES.maxOffered);
  });

  it(`routes at least ${pct(GATES.accuracy)} of cases correctly`, () => {
    expect(summarize('', semantic).accuracy).toBeGreaterThanOrEqual(GATES.accuracy);
  });

  it(`turns away at most ${pct(GATES.maxRefusal)} of course questions`, () => {
    expect(summarize('', semantic).refusal).toBeLessThanOrEqual(GATES.maxRefusal);
  });

  it(`ranks a correct lesson in the top 3 for ${pct(GATES.lessonTop3)} of course questions`, () => {
    expect(top3 / ranked).toBeGreaterThanOrEqual(GATES.lessonTop3);
  });

  it('never answers the screenshot question from a lesson', () => {
    expect(semantic.find((o) => o.id === 'screenshot-catholic')?.got).toBe('redirect');
  });
});
