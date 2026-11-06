/**
 * Scores Ben's routing on diagnosis cases and a separately reported fresh holdout.
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

type EvalSet = 'cases' | 'holdout';

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
  set: EvalSet;
  expected: Action;
  got: Action;
  lesson?: string;
  correct: boolean;
  drift: boolean;
  offered: boolean;
  refused: boolean;
}

interface Summary {
  name: string;
  count: number;
  accuracy: number | null;
  drift: number | null;
  offered: number | null;
  refusal: number | null;
}

interface Ranking {
  ranked: number;
  top1: number;
  top3: number;
}

/** Release gates. Raise them as the example bank grows; never lower them to pass. */
export const GATES = {
  accuracy: 0.85,
  maxDrift: 0.03,
  maxOffered: 0.1,
  maxRefusal: 0.08,
  lessonTop3: 0.9,
} as const;

function load(file: string, set: EvalSet): (Case & { set: EvalSet })[] {
  return JSON.parse(readFileSync(join(__dirname, file), 'utf8')).cases.map((c: Case) => ({ ...c, set }));
}

function isFreshHoldout(doc: { about: string; cases: { id: string }[] }): boolean {
  if (doc.cases.length === 0) return false;
  const priorBlind = /Blind holdout 2/i.test(doc.about) && doc.cases.every((c) => c.id.startsWith('n-'));
  if (priorBlind) return false;
  if (!/(fresh.*blind|blind.*fresh)/i.test(doc.about)) {
    throw new Error('Refusing to score a nonempty holdout without explicit fresh-blind provenance.');
  }
  return true;
}

function loadFreshHoldout(): (Case & { set: 'holdout' })[] {
  const doc = JSON.parse(readFileSync(join(__dirname, 'holdout.json'), 'utf8')) as { about: string; cases: Case[] };
  if (!isFreshHoldout(doc)) return [];
  return doc.cases.map((c) => ({ ...c, set: 'holdout' }));
}

/** The previously reported Blind Holdout 2 is not rescored; only an explicitly fresh set qualifies. */
const cases = [...load('cases.json', 'cases'), ...loadFreshHoldout()];

function judge(c: Case & { set: EvalSet }, got: Action, lesson?: string): Outcome {
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

function summarize(name: string, outcomes: Outcome[]): Summary {
  const n = outcomes.length;
  if (n === 0) return { name, count: 0, accuracy: null, drift: null, offered: null, refusal: null };
  const offCourse = outcomes.filter((o) => o.expected === 'redirect' || o.expected === 'self').length;
  const course = outcomes.filter((o) => o.expected === 'lesson').length;
  return {
    name,
    count: n,
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

const pct = (value: number | null) => (value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`);
const rate = (numerator: number, denominator: number) => (denominator === 0 ? null : numerator / denominator);

function bySet(outcomes: Outcome[], set: EvalSet): Outcome[] {
  return outcomes.filter((outcome) => outcome.set === set);
}

describe('evaluation set summaries', () => {
  it('marks an empty fresh holdout as not applicable, not as a passing zero-score set', () => {
    expect(summarize('holdout', [])).toMatchObject({
      count: 0,
      accuracy: null,
      drift: null,
      offered: null,
      refusal: null,
    });
  });

  it('does not score the previously reported n- blind set again', () => {
    expect(isFreshHoldout({ about: 'Blind holdout 2 (added 2026-11-03)', cases: [{ id: 'n-c-001' }] })).toBe(false);
  });

  it('requires explicit fresh-blind provenance before scoring a nonempty replacement', () => {
    expect(() => isFreshHoldout({ about: 'Unmarked questions', cases: [{ id: 'fresh-001' }] })).toThrow(/fresh-blind provenance/);
  });
});

describe('Ben routing by set', () => {
  let index: BenIndex;
  let embed: (texts: string[]) => Promise<number[][]>;
  const semantic: Outcome[] = [];
  const baseline: Outcome[] = [];
  const ranking: Record<EvalSet, Ranking> = {
    cases: { ranked: 0, top1: 0, top3: 0 },
    holdout: { ranked: 0, top1: 0, top3: 0 },
  };
  const freshCaseCount = cases.filter((c) => c.set === 'holdout').length;

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
        const setRanking = ranking[c.set];
        setRanking.ranked += 1;
        const slugs = decision.lessons.map((lesson) => lesson.slug);
        if (c.lessons.includes(slugs[0] ?? '')) setRanking.top1 += 1;
        if (slugs.slice(0, 3).some((slug) => c.lessons?.includes(slug))) setRanking.top3 += 1;
      }
      const old = legacy(c);
      baseline.push(judge(c, old.action, old.lesson));
    });

    const rows = (['cases', 'holdout', 'all'] as const).flatMap((set) => {
      const pick = (list: Outcome[]) => (set === 'all' ? list : bySet(list, set));
      return [summarize(`keyword pipeline, ${set}`, pick(baseline)), summarize(`semantic router, ${set}`, pick(semantic))];
    });
    const counts = `${cases.filter((c) => c.set === 'cases').length} diagnosis + ${freshCaseCount} fresh holdout`;
    const allRanking = (['cases', 'holdout'] as const).reduce<Ranking>(
      (total, set) => ({
        ranked: total.ranked + ranking[set].ranked,
        top1: total.top1 + ranking[set].top1,
        top3: total.top3 + ranking[set].top3,
      }),
      { ranked: 0, top1: 0, top3: 0 },
    );
    const rankingRows = (['cases', 'holdout'] as const).map((set) =>
      `| ${set} | ${ranking[set].ranked} | ${pct(rate(ranking[set].top1, ranking[set].ranked))} | ${pct(rate(ranking[set].top3, ranking[set].ranked))} |`,
    );
    rankingRows.push(`| all | ${allRanking.ranked} | ${pct(rate(allRanking.top1, allRanking.ranked))} | ${pct(rate(allRanking.top3, allRanking.ranked))} |`);
    const lines = [
      `\n${counts} cases, lesson index ${index.content}. Regenerate with \`npm run eval:ben\`.`,
      '',
      '| pipeline, set | cases | accuracy | drift: off-course answered | off-course, lessons offered | course turned away |',
      '|---|---:|---:|---:|---:|---:|',
      ...rows.map((s) => `| ${s.name} | ${s.count} | ${pct(s.accuracy)} | ${pct(s.drift)} | ${pct(s.offered)} | ${pct(s.refusal)} |`),
      '',
      'Semantic lesson ranking on course cases:',
      '| set | course cases ranked | top-1 | top-3 |',
      '|---|---:|---:|---:|',
      ...rankingRows,
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

  const diagnosisSemantic = () => bySet(semantic, 'cases');
  const diagnosisBaseline = () => bySet(baseline, 'cases');
  const diagnosisRank = () => ranking.cases;

  it('beats the keyword pipeline on diagnosis cases', () => {
    expect(summarize('semantic', diagnosisSemantic()).accuracy).toBeGreaterThan(
      summarize('baseline', diagnosisBaseline()).accuracy,
    );
  });

  it(`keeps diagnosis drift at or below ${pct(GATES.maxDrift)}`, () => {
    expect(summarize('diagnosis', diagnosisSemantic()).drift).toBeLessThanOrEqual(GATES.maxDrift);
  });

  it(`offers lessons for at most ${pct(GATES.maxOffered)} of diagnosis off-course cases`, () => {
    expect(summarize('diagnosis', diagnosisSemantic()).offered).toBeLessThanOrEqual(GATES.maxOffered);
  });

  it(`routes at least ${pct(GATES.accuracy)} of diagnosis cases correctly`, () => {
    expect(summarize('diagnosis', diagnosisSemantic()).accuracy).toBeGreaterThanOrEqual(GATES.accuracy);
  });

  it(`turns away at most ${pct(GATES.maxRefusal)} of diagnosis course cases`, () => {
    expect(summarize('diagnosis', diagnosisSemantic()).refusal).toBeLessThanOrEqual(GATES.maxRefusal);
  });

  it(`ranks a correct lesson in the top 3 for ${pct(GATES.lessonTop3)} of diagnosis course cases`, () => {
    expect(rate(diagnosisRank().top3, diagnosisRank().ranked)).toBeGreaterThanOrEqual(GATES.lessonTop3);
  });

  it.skipIf(freshCaseCount === 0)('keeps the fresh holdout separate and within every gate', () => {
    const freshSemantic = bySet(semantic, 'holdout');
    const freshBaseline = bySet(baseline, 'holdout');
    const fresh = summarize('fresh holdout', freshSemantic);
    expect(fresh.count).toBe(freshCaseCount);
    expect(fresh.accuracy).toBeGreaterThanOrEqual(GATES.accuracy);
    expect(fresh.drift).toBeLessThanOrEqual(GATES.maxDrift);
    expect(fresh.offered).toBeLessThanOrEqual(GATES.maxOffered);
    expect(fresh.refusal).toBeLessThanOrEqual(GATES.maxRefusal);
    expect(rate(ranking.holdout.top3, ranking.holdout.ranked)).toBeGreaterThanOrEqual(GATES.lessonTop3);
    expect(fresh.accuracy).toBeGreaterThan(summarize('keyword baseline', freshBaseline).accuracy);
    expect(freshSemantic.some((o) => o.id === 'screenshot-catholic')).toBe(false);
  });

  it('keeps the fixed screenshot assertion on diagnosis data only', () => {
    expect(bySet(semantic, 'cases').find((o) => o.id === 'screenshot-catholic')?.got).toBe('redirect');
    expect(bySet(semantic, 'holdout').some((o) => o.id === 'screenshot-catholic')).toBe(false);
  });
});
