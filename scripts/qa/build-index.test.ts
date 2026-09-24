// P1 (course Q&A agent): unit tests for the build-time index generator.
// These run under the root vitest setup (worker/** is excluded there).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildIndexFromLessons, buildQaMetaData, chunkSection, extractVideos, stripMdx } from './build-index.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const FIXTURE_MDX = `export const meta = {
  slug: 'demo-lesson',
  title: 'Demo Lesson',
};

## Why this matters

Prose about caching and the CAP theorem. Kevin the intern appears here in
legitimate prose, which must survive stripping.

<VideoCard videoId="abc123" title="A video" source="Someone" description="A description." />

\`\`\`mermaid
flowchart LR
    A --> B
\`\`\`

## Go deeper

- [A link](https://example.com) -- bibliography, must be dropped.

<Quiz
  lessonSlug="demo-lesson"
  questions={[
    {
      question: "Kevin the intern keeps retrying. What saves him?",
      options: ["Nothing", "Idempotency plus caps"],
      correctIndex: 1,
    },
  ]}
/>

## Takeaways

Caching wins. CAP theorem constrains.
`;

describe('stripMdx', () => {
  it('removes the meta export, components, quiz, mermaid, and fences', () => {
    const out = stripMdx(FIXTURE_MDX);
    expect(out).not.toContain('export const meta');
    expect(out).not.toContain('VideoCard');
    expect(out).not.toContain('<Quiz');
    expect(out).not.toContain('correctIndex');
    expect(out).not.toContain('Idempotency plus caps');
    expect(out).not.toContain('flowchart LR');
    expect(out).not.toContain('```');
  });

  it('keeps legitimate prose, including quiz-adjacent words in prose', () => {
    const out = stripMdx(FIXTURE_MDX);
    expect(out).toContain('Prose about caching and the CAP theorem');
    expect(out).toContain('Kevin the intern appears here in');
    expect(out).toContain('## Takeaways');
  });

  it('removes paired (non-self-closing) component tags too', () => {
    const out = stripMdx('before <StepThrough title="x">inner text</StepThrough> after');
    expect(out).not.toContain('StepThrough');
    expect(out).not.toContain('inner text');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });
});

describe('chunkSection', () => {
  it('splits long prose at paragraph boundaries near the word budget', () => {
    const para = 'word '.repeat(300).trim();
    const chunks = chunkSection(`${para}\n\n${para}\n\n${para}`);
    expect(chunks.length).toBe(3);
    for (const c of chunks) {
      const words = c.split(/\s+/).length;
      expect(words).toBeLessThanOrEqual(400);
    }
  });

  it('keeps short sections whole and drops empties', () => {
    expect(chunkSection('short text')).toEqual(['short text']);
    expect(chunkSection('   \n\n  ')).toEqual([]);
  });
});

describe('generated artifacts on disk', () => {
  // Distinctive strings from <Quiz> blocks in content/lessons/*.mdx. The
  // committed artifacts must never contain them.
  const QUIZ_STRINGS = [
    'correctIndex',
    'The phone line between your two diners is cut. A CP system will...',
    "Keep seating customers and serving whatever's on the board, stale or not",
    'Two nodes that are both alive and reachable by clients, but unable to reach each other',
    'Kevin the intern keeps retrying a failed payment API. Which two guardrails',
    'Reasoning tokens bill as output tokens, so heavy reasoning pushes a step',
  ];

  it('qa-index.ts has no quiz material', () => {
    const src = readFileSync(join(repoRoot, 'worker', 'src', 'qa', 'qa-index.ts'), 'utf8');
    for (const s of QUIZ_STRINGS) {
      expect(src, `leaked: ${s}`).not.toContain(s);
    }
  });

});

describe('buildIndexFromLessons', () => {
  it('builds chunks + index with zero quiz leakage end to end', () => {
    const { chunks, indexData } = buildIndexFromLessons(
      [{ slug: 'demo-lesson', title: 'Demo Lesson', mdx: FIXTURE_MDX }],
      '2026-01-01T00:00:00.000Z',
    );
    expect(chunks.length).toBeGreaterThan(0);
    // "Go deeper" bibliography section dropped; Overview + Why this matters
    // + Takeaways kept.
    const headings = chunks.map((c) => c.heading);
    expect(headings).not.toContain('Go deeper');
    expect(chunks.every((c) => c.slug === 'demo-lesson')).toBe(true);
    // Ordinals are per-lesson and contiguous from 0.
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));

    const allText = chunks.map((c) => c.text).join('\n');
    expect(allText).not.toContain('correctIndex');
    expect(allText).not.toContain('Idempotency plus caps');
    expect(allText).not.toContain('What saves him?');

    const indexJson = JSON.stringify(indexData);
    expect(indexJson).not.toContain('correctIndex');
  });

  it('is deterministic for identical input', () => {
    const input = [{ slug: 'demo-lesson', title: 'Demo Lesson', mdx: FIXTURE_MDX }];
    const a = buildIndexFromLessons(input, '2026-01-01T00:00:00.000Z');
    const b = buildIndexFromLessons(input, '2026-01-01T00:00:00.000Z');
    expect(JSON.stringify(a.indexData)).toBe(JSON.stringify(b.indexData));
  });
});

describe('extractVideos', () => {
  it('extracts VideoCard props and tags them with the lesson', () => {
    const videos = extractVideos(FIXTURE_MDX);
    expect(videos).toEqual([
      {
        videoId: 'abc123',
        title: 'A video',
        source: 'Someone',
        description: 'A description.',
      },
    ]);
  });

  it('ignores malformed VideoCards without videoId/title', () => {
    expect(extractVideos('<VideoCard title="No id" />')).toEqual([]);
    expect(extractVideos('no cards here')).toEqual([]);
  });
});

describe('buildQaMetaData', () => {
  it('builds curriculum in syllabus order plus the video catalog, quiz-free', () => {
    const meta = buildQaMetaData(
      [
        {
          slug: 'b-lesson',
          title: 'B Lesson',
          tier: 'advanced',
          order: 2,
          summary: 'B summary',
          topics: ['t'],
          mdx: FIXTURE_MDX,
        },
        {
          slug: 'a-lesson',
          title: 'A Lesson',
          tier: 'beginner',
          order: 1,
          summary: 'A summary',
          topics: [],
          mdx: 'export const meta = { slug: "a-lesson" };\n\n## Intro\n\nHi.',
        },
      ],
      '2026-01-01T00:00:00.000Z',
    );
    expect(meta.version).toBe(1);
    expect(meta.curriculum.map((c) => c.slug)).toEqual(['a-lesson', 'b-lesson']);
    expect(meta.videos).toHaveLength(1);
    expect(meta.videos[0]).toMatchObject({ slug: 'b-lesson', lessonTitle: 'B Lesson', videoId: 'abc123' });
    expect(JSON.stringify(meta)).not.toContain('correctIndex');
  });
});

describe('generated qa-meta.ts on disk', () => {
  it('has 36 curriculum lessons and the video catalog, quiz-free', () => {
    const src = readFileSync(join(repoRoot, 'worker', 'src', 'qa', 'qa-meta.ts'), 'utf8');
    const match = /export const QA_META: QaMetaData = ([\s\S]*)$/.exec(src);
    expect(match?.[1]).toBeDefined();
    const data = JSON.parse(match?.[1] as string) as {
      curriculum: Array<{ slug: string; order: number }>;
      videos: Array<{ videoId: string; slug: string }>;
    };
    expect(data.curriculum).toHaveLength(36);
    const orders = data.curriculum.map((c) => c.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(data.videos.length).toBeGreaterThan(200);
    expect(src).not.toContain('correctIndex');
  });
});
