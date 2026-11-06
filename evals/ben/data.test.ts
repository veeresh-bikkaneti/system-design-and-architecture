import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chunkAllLessons, chunkLesson } from '../../scripts/ben/chunk-lessons.mjs';
import { OKF_CARDS } from '../../src/ai/local/cards.ts';

// Runs in the default `npm test` suite: no model needed.

describe('lesson chunker', () => {
  it('keeps prose and drops quizzes, code, and the sources list', () => {
    const source = `export const meta = {
  slug: 'demo',
  title: 'Demo',
  tier: 'beginner',
  order: 1,
  summary: 'A demo lesson.',
  estimatedMinutes: 5,
};

## Why this matters

Caches keep hot data close to the reader so the database does less work on every single request.
They trade freshness for speed, and every design decision follows from how stale you can afford to be.

\`\`\`mermaid
flowchart LR
  a --> b
\`\`\`

<Quiz
  lessonSlug="demo"
  questions={[{ question: "Secret quiz text", options: ["a"], correctIndex: 0 }]}
/>

## Sources & further reading

- [A paper](https://example.com)
`;
    const chunks = chunkLesson(source, 'demo.mdx');
    const text = chunks.map((c: { text: string }) => c.text).join(' ');
    expect(text).toMatch(/Caches keep hot data/);
    expect(text).not.toMatch(/Secret quiz text|flowchart|A paper/);
  });

  it('splits every lesson into sections short enough for the embedder', () => {
    const chunks = chunkAllLessons();
    const slugs = new Set(chunks.map((c: { slug: string }) => c.slug));
    expect(slugs.size).toBe(41);
    for (const c of chunks) expect(c.text.split(/\s+/).length).toBeLessThanOrEqual(200);
  });
});

describe('eval data hygiene', () => {
  const read = (file: string) => JSON.parse(readFileSync(join(__dirname, file), 'utf8'));
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  it('never votes with a question it is scored on', () => {
    const bank = new Set(read('exemplars.json').examples.map((e: { text: string }) => norm(e.text)));
    const scored = [...read('cases.json').cases, ...read('holdout.json').cases];
    const leaked = scored.filter((c: { q: string }) => bank.has(norm(c.q))).map((c: { id: string }) => c.id);
    expect(leaked).toEqual([]);
  });

  // D2b (docs/manifests/ben-router-generalization.md). Exemplars must be general paraphrases drafted
  // from the lessons and the intent definitions, never copies of an eval question. The exact-match
  // test above is the floor; this one also catches a question with one word changed.
  it('never votes with a near-copy of a scored question', () => {
    const tokens = (text: string) => norm(text).split(' ').filter(Boolean);
    const near = (a: string, b: string) => {
      const ta = tokens(a);
      const tb = tokens(b);
      if (ta.length >= 3 && tb.length >= 3 && (` ${norm(a)} `.includes(` ${norm(b)} `) || ` ${norm(b)} `.includes(` ${norm(a)} `))) return true;
      const sa = new Set(ta);
      const sb = new Set(tb);
      const shared = [...sa].filter((word) => sb.has(word)).length;
      return shared / (sa.size + sb.size - shared) >= 0.75;
    };
    const bank = read('exemplars.json').examples as { text: string }[];
    const scored = [...read('cases.json').cases, ...read('holdout.json').cases] as { id: string; q: string }[];
    const copies = bank.flatMap((e) => scored.filter((c) => near(e.text, c.q)).map((c) => `${c.id} ~ ${e.text}`));
    expect(copies).toEqual([]);
  });

  // Bank shape contracts (RED before D2b, from docs/diagnostics/ben-miss-diagnosis-2026-11-03.md).
  it('does not let "How do I..." dominate the off_topic exemplars', () => {
    const off = (read('exemplars.json').examples as { intent: string; text: string }[]).filter((e) => e.intent === 'off_topic');
    const howDoI = off.filter((e) => /^how do i\b/i.test(e.text)).length;
    expect(howDoI / off.length).toBeLessThanOrEqual(0.35);
  });

  it('teaches the router that "what is the X pattern/principle" is a course question', () => {
    const course = (read('exemplars.json').examples as { intent: string; text: string }[]).filter((e) => e.intent === 'course');
    const named = course.filter((e) => /^what (is|does) (the |a |an )?[\w -]+ (pattern|principle)\??$/i.test(e.text));
    expect(named.length).toBeGreaterThanOrEqual(4);
  });

  it('labels every scored lesson with a real lesson slug', () => {
    // Guides count too: the router pins `tutor-loop` (a Guide, not in the lesson
    // index), so a setup case's correct answer is a Guide slug.
    const guides = OKF_CARDS.filter((card) => card.type === 'Guide').map((card) => card.id);
    const slugs = new Set([...chunkAllLessons().map((c: { slug: string }) => c.slug), ...guides]);
    const scored = [...read('cases.json').cases, ...read('holdout.json').cases];
    for (const c of scored) for (const slug of c.lessons ?? []) expect(slugs.has(slug), `${c.id}: ${slug}`).toBe(true);
  });

  it('labels ambiguous and own-environment setup as clarification without changing explicit tutor setup', () => {
    const cases = read('cases.json').cases as { id: string; action: string; alsoOk?: string[]; lessons?: string[] }[];
    const byId = new Map(cases.map((c) => [c.id, c]));
    for (const id of ['env-setup-report', 'env-setup-2', 'env-setup-3', 'env-own-python', 'env-own-conda', 'env-own-openai']) {
      expect(byId.get(id)?.action, id).toBe('clarify');
      expect(byId.get(id)?.alsoOk ?? [], id).not.toContain('parametric_fallback');
    }
    for (const id of ['tutor-setup-1', 'tutor-setup-2']) {
      expect(byId.get(id), id).toMatchObject({ action: 'lesson', lessons: ['tutor-loop'] });
    }
    expect(byId.get('env-noun-netflix')?.action).toBe('parametric_fallback');
  });

  it('keeps diagnosis and holdout disjoint without treating the prior blind set as diagnosis data', () => {
    const diagnosis = read('cases.json').cases as { id: string }[];
    const holdoutDoc = read('holdout.json') as { about: string; cases: { id: string }[] };
    const holdout = holdoutDoc.cases;
    expect(new Set([...diagnosis, ...holdout].map((c) => c.id)).size).toBe(diagnosis.length + holdout.length);
    if (holdoutDoc.about.includes('Blind holdout 2')) {
      expect(holdout).toHaveLength(103);
      expect(holdout.every((c) => c.id.startsWith('n-'))).toBe(true);
      expect(diagnosis.some((c) => c.id.startsWith('n-'))).toBe(false);
    } else if (holdout.length > 0) {
      expect(holdoutDoc.about.toLowerCase()).toContain('fresh');
      expect(holdoutDoc.about.toLowerCase()).toContain('blind');
    }
  });
});
