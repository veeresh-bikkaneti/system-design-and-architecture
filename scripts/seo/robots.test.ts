import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const robots = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8').replace(/\r/g, '');

describe('robots.txt content signals', () => {
  it('declares AI-use preferences inside the catch-all group', () => {
    const group = robots.split(/\n\s*\n/).find((block) => /^User-agent:\s*\*/m.test(block));
    expect(group).toBeDefined();
    expect(group).toMatch(/^Content-Signal:\s*ai-train=no,\s*search=yes,\s*ai-input=no\s*$/m);
  });

  it('still allows crawling and still points at the sitemap', () => {
    expect(robots).toMatch(/^Allow:\s*\/\s*$/m);
    expect(robots).toMatch(/^Sitemap:\s*https:\/\/\S+\/sitemap\.xml\s*$/m);
  });
});
