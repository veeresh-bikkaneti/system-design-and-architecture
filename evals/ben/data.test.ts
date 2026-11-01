import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chunkAllLessons, chunkLesson, isFragment } from '../../scripts/ben/chunk-lessons.mjs';

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

  // Same predicate the build gate uses (scripts/ben/build-index.mjs), so they can't disagree.
  it('knows a fragment when it sees one', () => {
    expect(isFragment('narrow and careful at the bottom.')).toBe(true);
    expect(isFragment('Watch it fan out:')).toBe(true);
    expect(isFragment('Fine. And then 5,000 tasks')).toBe(true);
    expect(isFragment('It guards the boundary.)')).toBe(false);
    expect(isFragment('Fits in one budget ✅')).toBe(true);
    expect(isFragment('Fits in one budget. ✅')).toBe(false);
  });

  it('never cuts a section mid-sentence', () => {
    const fragments = chunkAllLessons()
      .filter((c: { text: string }) => isFragment(c.text))
      .map((c: { id: string }) => c.id);
    expect(fragments).toEqual([]);
  });

  it('starts the RAG "Generate." step at a sentence boundary', () => {
    const chunk = chunkAllLessons().find(
      (c: { slug: string; text: string }) => c.slug === 'designing-ai-systems' && c.text.includes('Generate.'),
    );
    expect(chunk).toBeDefined();
    expect(chunk!.text).toMatch(/^[A-Z"“(]/);
    expect(isFragment(chunk!.text)).toBe(false);
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
    const slugs = new Set(chunkAllLessons().map((c: { slug: string }) => c.slug));
    const scored = [...read('cases.json').cases, ...read('holdout.json').cases];
    for (const c of scored) for (const slug of c.lessons ?? []) expect(slugs.has(slug), `${c.id}: ${slug}`).toBe(true);
  });
});
