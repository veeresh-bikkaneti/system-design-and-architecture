/**
 * Generates `public/llms.txt` (copied to `dist/` by the Vite build).
 *
 * A plain-text course map for AI fetchers: what the course is, all 36
 * lessons with real titles/summaries/URLs, plus roadmap/badges/source links.
 * Per Google's own AI optimization guide this carries no ranking weight for
 * Google Search — it is near-zero-cost surface for non-Google AI systems.
 *
 * Runs automatically via `prebuild`.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot, loadLessonMetas, siteConfig } from './lesson-meta.mjs';

const { siteUrl } = siteConfig();
const metas = loadLessonMetas();

const lines = [
  '# System Design Mastery',
  '',
  '> Learn system design progressively, from beginner to master, with an AI tutor that draws you the diagrams.',
  '',
  'A free, self-paced system design course: 36 lessons across beginner, intermediate, and advanced tiers, each with an interactive quiz. Interactive diagrams, an AI tutor, and badges for progress.',
  '',
  '## Lessons',
  '',
  ...metas.map(
    (m) => `- [${m.title}](${siteUrl}lesson/${m.slug}/): ${m.summary}`,
  ),
  '',
  '## More',
  '',
  `- [Roadmap](${siteUrl}roadmap/): the full learning path in syllabus order.`,
  `- [Badges](${siteUrl}badges/): achievements earned by completing lessons and quizzes.`,
  '- [Source](https://github.com/veeresh-bikkaneti/system-design-and-architecture): the course is open source.',
];

writeFileSync(join(repoRoot, 'public', 'llms.txt'), lines.join('\n') + '\n');
console.log(`llms.txt: ${metas.length} lessons`);
