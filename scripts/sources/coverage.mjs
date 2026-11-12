/**
 * Sources-linking coverage counter (F5 pilot, branch content/sources-linking-pilot).
 *
 * Census method (matches the Phase 1 interrogation census, §1 F5):
 * an entry is a `- ` bullet line inside the lesson's `## Sources` section
 * (from that heading to the next `## ` heading or end of file); an entry is
 * linked when it contains a markdown link to an http(s) URL (`](http...`).
 * Bare URLs do not count as linked (Phase 1 counted them separately: 0).
 *
 * Usage: node scripts/sources/coverage.mjs [lessonsDir]
 * Prints one line per lesson plus a TOTAL line. Deterministic and offline;
 * link *liveness* is a run-once PR-time check and never lives here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../ben/is-main.mjs';

export function parseSourcesEntries(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => /^## Sources/.test(l));
  if (start === -1) return [];
  const entries = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    if (lines[i].startsWith('- ')) entries.push(lines[i]);
  }
  return entries;
}

export function countLessonSources(source) {
  const entries = parseSourcesEntries(source);
  const linked = entries.filter((e) => /\]\(https?:\/\//.test(e)).length;
  return { total: entries.length, linked, unlinked: entries.length - linked };
}

export function countCorpus(lessonsDir) {
  const perLesson = readdirSync(lessonsDir)
    .filter((f) => f.endsWith('.mdx'))
    .sort()
    .map((f) => ({
      lesson: f.replace(/\.mdx$/, ''),
      ...countLessonSources(readFileSync(join(lessonsDir, f), 'utf8')),
    }));
  const total = perLesson.reduce(
    (acc, l) => ({
      total: acc.total + l.total,
      linked: acc.linked + l.linked,
      unlinked: acc.unlinked + l.unlinked,
    }),
    { total: 0, linked: 0, unlinked: 0 },
  );
  return {
    perLesson,
    total,
    lessonsWithZeroLinked: perLesson.filter((l) => l.linked === 0).length,
    lessons: perLesson.length,
  };
}

if (isMainModule(import.meta.url)) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dir = process.argv[2] ?? join(repoRoot, 'content', 'lessons');
  const { perLesson, total, lessonsWithZeroLinked, lessons } = countCorpus(dir);
  for (const l of perLesson) {
    console.log(`${l.lesson}: ${l.linked}/${l.total} linked, ${l.unlinked} unlinked`);
  }
  console.log(
    `TOTAL: ${total.linked}/${total.total} linked, ${total.unlinked} unlinked; ` +
      `${lessonsWithZeroLinked}/${lessons} lessons with 0 linked`,
  );
}
