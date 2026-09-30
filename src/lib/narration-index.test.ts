import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { NARRATION_INDEX } from './narration-index.generated';
import { hasNarration, narrationIndexKey } from './narration-index';

/* ------------------------------------------------------------------ */
/* narrationIndexKey / hasNarration                                     */
/* ------------------------------------------------------------------ */

describe('narrationIndexKey', () => {
  it('formats slug/accent keys', () => {
    expect(narrationIndexKey('url-shortener', 'us')).toBe('url-shortener/us');
    expect(narrationIndexKey('url-shortener', 'uk')).toBe('url-shortener/uk');
  });
});

describe('hasNarration', () => {
  // The repo ships US + UK narration for every lesson —
  // see scripts/tts/generate_narration_index.py.
  it('is true for a lesson with build-time narration (US)', () => {
    expect(hasNarration('url-shortener', 'us')).toBe(true);
  });

  it('is true for a lesson with build-time narration (UK)', () => {
    expect(hasNarration('url-shortener', 'uk')).toBe(true);
  });

  it('is false for an unknown lesson (never probes a 404)', () => {
    expect(hasNarration('not-a-lesson', 'us')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* index freshness: the committed bitset must match public/audio        */
/* ------------------------------------------------------------------ */

describe('NARRATION_INDEX freshness', () => {
  it('matches the narration.json packages on disk', () => {
    // The index is generated, never hand-maintained. If this fails, run:
    //   python3 scripts/tts/generate_narration_index.py
    const audioDir = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      '..',
      'public',
      'audio',
    );
    const onDisk = new Set<string>();
    for (const slug of readdirSync(audioDir, { withFileTypes: true })) {
      if (!slug.isDirectory()) continue;
      for (const accent of readdirSync(join(audioDir, slug.name), {
        withFileTypes: true,
      })) {
        if (!accent.isDirectory()) continue;
        if (existsSync(join(audioDir, slug.name, accent.name, 'narration.json'))) {
          onDisk.add(`${slug.name}/${accent.name}`);
        }
      }
    }
    expect([...NARRATION_INDEX].sort()).toEqual([...onDisk].sort());
  });

  it('is tiny (the whole point of the bitset)', () => {
    // Every key is one short string; the bundled module stays ~1-2 KB.
    expect(NARRATION_INDEX.size).toBeLessThan(200);
  });
});
