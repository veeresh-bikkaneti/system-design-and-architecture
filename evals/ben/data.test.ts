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

  it('labels every scored lesson with a real lesson slug', () => {
    // Guides count too: the router pins `tutor-loop` (a Guide, not in the lesson
    // index), so a setup case's correct answer is a Guide slug.
    const guides = OKF_CARDS.filter((card) => card.type === 'Guide').map((card) => card.id);
    const slugs = new Set([...chunkAllLessons().map((c: { slug: string }) => c.slug), ...guides]);
    const scored = [...read('cases.json').cases, ...read('holdout.json').cases];
    for (const c of scored) for (const slug of c.lessons ?? []) expect(slugs.has(slug), `${c.id}: ${slug}`).toBe(true);
  });

  // Branch 2 (test/ben-howto-heldout) fixture hygiene for the F2 how-to cases.
  const branch2 = (c: { id: string }) => /^h-(howto|ctrl|guard)-/.test(c.id);

  it('does not duplicate a scored question across sets, except the pinned partition-key control', () => {
    // Anti-leak, extended across the two scored sets: a question scored in
    // cases.json must not be re-scored in holdout.json. Sole recorded exception:
    // "how do i pick a partition key" is pinned in holdout as the §7 control
    // (h-ctrl-partition-key) with its HEAD-actual `clarify` expectation, while
    // cases.json c-part-2 carries a `lesson` expectation HEAD does not meet.
    const inCases = new Map(read('cases.json').cases.map((c: { q: string; id: string }) => [norm(c.q), c.id]));
    const dupes = read('holdout.json').cases
      .filter((c: { q: string }) => inCases.has(norm(c.q)))
      .map((c: { id: string }) => c.id);
    expect(dupes).toEqual(['h-ctrl-partition-key']);
  });

  it('gives every tool-route (howto) case a source URL or a confidence mark', () => {
    const scored = [...read('cases.json').cases, ...read('holdout.json').cases];
    const toolRoute = scored.filter((c: { action: string }) => c.action === 'howto');
    expect(toolRoute.length).toBeGreaterThan(0);
    for (const c of toolRoute) {
      const sourced = typeof c.source === 'string' && /^https:\/\//.test(c.source);
      const marked = ['verified', 'likely', 'guess'].includes(c.confidence);
      expect(sourced || marked, `${c.id}: needs a source URL or confidence mark`).toBe(true);
    }
  });

  it('gives every branch-2 fixture a source URL or a confidence mark, and no lesson slug to how-to cases', () => {
    const fresh = read('holdout.json').cases.filter(branch2);
    expect(fresh.length).toBe(12);
    for (const c of fresh) {
      const sourced = typeof c.source === 'string' && /^https:\/\//.test(c.source);
      const marked = ['verified', 'likely', 'guess'].includes(c.confidence);
      expect(sourced || marked, `${c.id}: needs a source URL or confidence mark`).toBe(true);
      // A how-to expectation must not pretend a lesson covers it (slug hygiene).
      if (c.action === 'howto') expect(c.lessons, `${c.id}: howto cases name no lesson`).toBeUndefined();
    }
  });

  it('keeps case ids unique across both scored sets', () => {
    const ids = [...read('cases.json').cases, ...read('holdout.json').cases].map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
