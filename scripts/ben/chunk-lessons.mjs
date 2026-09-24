/**
 * Split lesson MDX into prose sections for Ben's semantic index.
 *
 * Keeps headings and paragraphs. Drops the meta export, fenced code (including
 * mermaid), JSX component blocks (quizzes, videos, simulators), and the
 * "Sources & further reading" list, which is links rather than teaching.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractMeta, lessonsDir } from '../seo/lesson-meta.mjs';

/** MiniLM reads about 256 word pieces. Keep sections comfortably under that. */
const MAX_WORDS = 150;
const MIN_WORDS = 25;

function stripMarkdown(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|[.,;:!?)]|$)/g, '$1$2')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Remove the meta block, fenced code, and multi-line JSX components. */
export function proseLines(source) {
  const body = source.replace(/export const meta = \{[\s\S]*?\n\};/, '');
  const lines = body.split('\n');
  const kept = [];
  let fence = false;
  let jsx = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (jsx) {
      if (trimmed === '/>' || trimmed.endsWith('/>') || trimmed.startsWith(`</${jsx}`)) jsx = null;
      continue;
    }
    const open = trimmed.match(/^<([A-Z][A-Za-z]*)\b/);
    if (open) {
      const selfClosed = trimmed.endsWith('/>') || trimmed.includes(`</${open[1]}>`);
      if (!selfClosed) jsx = open[1];
      continue;
    }
    if (/^(import|export)\s/.test(trimmed)) continue;
    kept.push(line);
  }
  return kept;
}

function words(text) {
  return text.split(/\s+/).filter(Boolean);
}

/** Split one heading's prose into windows no longer than MAX_WORDS, on paragraph lines. */
function windows(paragraphs) {
  const out = [];
  let current = [];
  let count = 0;
  for (const paragraph of paragraphs) {
    const size = words(paragraph).length;
    if (count > 0 && count + size > MAX_WORDS) {
      out.push(current.join(' '));
      current = [];
      count = 0;
    }
    if (size > MAX_WORDS) {
      const tokens = words(paragraph);
      for (let i = 0; i < tokens.length; i += MAX_WORDS) out.push(tokens.slice(i, i + MAX_WORDS).join(' '));
      continue;
    }
    current.push(paragraph);
    count += size;
  }
  if (current.length > 0) out.push(current.join(' '));
  return out;
}

/** Sections for one lesson: `{ slug, title, heading, text }`, in reading order. */
export function chunkLesson(source, file = 'lesson.mdx') {
  const meta = extractMeta(source, file);
  const sections = [];
  let heading = 'Overview';
  let paragraphs = [];
  let para = [];

  const flushParagraph = () => {
    const text = stripMarkdown(para.join(' '));
    if (text) paragraphs.push(text);
    para = [];
  };
  const flushSection = () => {
    flushParagraph();
    if (!/sources|further reading/i.test(heading)) {
      for (const text of windows(paragraphs)) sections.push({ heading, text });
    }
    paragraphs = [];
  };

  // A list item is one sentence, even when it wraps over several source lines.
  let item = null;
  const finishItem = () => {
    if (item !== null) para.push(/[.!?:;]$/.test(item) ? item : `${item}.`);
    item = null;
  };

  for (const line of proseLines(source)) {
    const match = line.match(/^#{2,3}\s+(.+)$/);
    if (match) {
      finishItem();
      flushSection();
      heading = stripMarkdown(match[1]);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === '' || /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      finishItem();
      flushParagraph();
      continue;
    }
    const bullet = trimmed.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
    if (bullet) {
      finishItem();
      item = bullet[1];
    } else if (item !== null) {
      item = `${item} ${trimmed}`;
    } else {
      para.push(trimmed);
    }
  }
  finishItem();
  flushSection();

  // Fold a short section into its neighbour so every vector carries enough meaning.
  const merged = [];
  for (const section of sections) {
    const last = merged[merged.length - 1];
    if (last && words(section.text).length < MIN_WORDS && words(last.text).length < MAX_WORDS) {
      last.text = `${last.text} ${section.text}`;
    } else if (last && words(last.text).length < MIN_WORDS) {
      last.text = `${last.text} ${section.text}`;
      last.heading = section.heading;
    } else {
      merged.push({ ...section });
    }
  }

  return merged.map((section, index) => ({
    id: `${meta.slug}#${index}`,
    slug: meta.slug,
    title: meta.title,
    heading: section.heading,
    text: section.text,
  }));
}

/** Every lesson's sections, plus one summary section per lesson built from its meta. */
export function chunkAllLessons() {
  const files = readdirSync(lessonsDir)
    .filter((file) => file.endsWith('.mdx'))
    .sort();
  const chunks = [];
  for (const file of files) {
    const source = readFileSync(join(lessonsDir, file), 'utf8');
    const meta = extractMeta(source, file);
    chunks.push({
      id: `${meta.slug}#summary`,
      slug: meta.slug,
      title: meta.title,
      heading: 'Summary',
      text: `${meta.title}. ${meta.summary}`,
    });
    chunks.push(...chunkLesson(source, file));
  }
  return chunks;
}
