import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadLessonMetas } from '../../scripts/seo/lesson-meta.mjs';
import { useProgressStore } from '../store/progress';
import { RoadmapPage } from './RoadmapPage';

// Derived-from-data assertions (NOT snapshots): the expected lesson and
// tier counts are computed at test time from the single enumerator
// (scripts/seo/lesson-meta.mjs over content/lessons/*.mdx), so a future
// lesson added or removed moves the expectation with the data. A snapshot
// assertion would have passed on the fossil strings this file guards
// against ("Thirty-six lessons", numberOfLessons: 36).
const metas = loadLessonMetas();
const expectedCount = metas.length;
const expectedTiers = new Set(metas.map((m) => m.tier)).size;

const repoFile = (...parts: string[]) => readFileSync(resolve(__dirname, '../..', ...parts), 'utf8');

beforeAll(() => {
  // RoadmapPage's scroll effect and the reduced-motion hook call
  // window.matchMedia directly; jsdom does not implement it. Report
  // reduced motion so both take their static path.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
});

afterEach(() => {
  cleanup();
});

function renderRoadmap() {
  useProgressStore.setState({ completedLessons: [] });
  return render(
    <MemoryRouter initialEntries={['/roadmap']}>
      <Routes>
        <Route path="/roadmap" element={<RoadmapPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('lesson-count derivation (enumerator sanity)', () => {
  it('enumerator count matches the MDX files on disk and tiers are non-empty', () => {
    const mdxCount = readdirSync(resolve(__dirname, '../../content/lessons')).filter((f) =>
      f.endsWith('.mdx'),
    ).length;
    expect(expectedCount).toBe(mdxCount);
    expect(expectedCount).toBeGreaterThan(0);
    expect(expectedTiers).toBeGreaterThan(0);
  });
});

describe('RoadmapPage hero (rendered)', () => {
  it('hero states the derived lesson count and derived tier count', () => {
    const { container } = renderRoadmap();
    const text = container.textContent ?? '';
    expect(text).toContain(`${expectedCount} lessons in ${expectedTiers} tiers`);
    expect(text).not.toContain('Thirty-six');
  });

  it('SEO description states the derived lesson count', () => {
    renderRoadmap();
    const description = document.head
      .querySelector('meta[name="description"]')
      ?.getAttribute('content');
    expect(description).toContain(`${expectedCount} lessons`);
  });
});

describe('prerender home snapshot (scripts/seo/prerender.mjs)', () => {
  it('home snapshot interpolates the enumerator count and a metas-derived tier count', () => {
    const src = repoFile('scripts/seo/prerender.mjs');
    const homeLine = src
      .split('\n')
      .find((line) => line.includes('lessons across') && line.includes('tiers'));
    expect(homeLine).toBeDefined();
    expect(homeLine).toContain('${metas.length} lessons across');
    expect(homeLine).not.toContain('Thirty-six');
    // Tier count must come from the metas, not a typed numeral/word.
    expect(src).toMatch(/new Set\(metas\.map\(/);
  });

  it('roadmap snapshot description interpolates the enumerator count', () => {
    const src = repoFile('scripts/seo/prerender.mjs');
    const line = src
      .split('\n')
      .find((l) => l.includes('learning path:') && l.includes('lessons from beginner'));
    expect(line).toBeDefined();
    expect(line).toContain('${metas.length} lessons');
  });
});

describe('JSON-LD numberOfLessons', () => {
  it('index.html template carries no hand-typed numberOfLessons numeral', () => {
    const html = repoFile('index.html');
    expect(html).not.toMatch(/"numberOfLessons":\s*\d+/);
  });

  it('prerender derives numberOfLessons from the enumerator', () => {
    const src = repoFile('scripts/seo/prerender.mjs');
    expect(src).toContain('numberOfLessons: metas.length');
  });
});

// Build-emitted JSON-LD: only runs when a fresh build's dist/ is present
// (npm run build). Encodes the per-route observation: no emitted route may
// carry a numberOfLessons other than the derived count, and the home route
// must carry the derived Course value (i.e. prerender replaced the
// template's JSON-LD rather than the fossil surviving anywhere).
const distDir = resolve(__dirname, '../../dist');
describe.runIf(existsSync(join(distDir, 'index.html')))('build-emitted JSON-LD (dist/)', () => {
  const emittedHtmlFiles = () =>
    readdirSync(distDir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.html'))
      .map((f) => join(distDir, f));

  const courseLessonCounts = (html: string) => {
    const counts: number[] = [];
    for (const match of html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )) {
      const parsed: unknown = JSON.parse(match[1]);
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (
          node &&
          typeof node === 'object' &&
          (node as { '@type'?: string })['@type'] === 'Course' &&
          typeof (node as { numberOfLessons?: unknown }).numberOfLessons === 'number'
        ) {
          counts.push((node as { numberOfLessons: number }).numberOfLessons);
        }
      }
    }
    return counts;
  };

  it('home route Course JSON-LD carries the derived count', () => {
    const home = readFileSync(join(distDir, 'index.html'), 'utf8');
    expect(courseLessonCounts(home)).toEqual([expectedCount]);
  });

  it('no emitted route carries a stale numberOfLessons', () => {
    for (const file of emittedHtmlFiles()) {
      for (const count of courseLessonCounts(readFileSync(file, 'utf8'))) {
        expect(count, file).toBe(expectedCount);
      }
    }
  });
});
