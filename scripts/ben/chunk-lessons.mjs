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

/** Where proseLines cut a code fence or a JSX component out of the prose. */
export const STRIPPED = '\u0000stripped';

/** Short tokens that end in a dot without ending the sentence. */
const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'vs.', 'cf.', 'etc.', 'u.s.', 'mr.', 'mrs.', 'ms.', 'dr.', 'st.', 'jr.', 'no.', 'fig.', 'approx.']);

/**
 * Split prose into sentences. Only breaks after . ! ? … (plus any closing
 * quote or paren) when the next word starts with a capital, digit, or opening
 * quote, so decimals, versions, and "e.g. the" stay glued. Abbreviations and
 * single initials ("J. Smith") never end a sentence.
 */
export function splitSentences(text) {
  const out = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?…]["'”’)\]]*\s+(?=["'“‘(]?[A-Z0-9$])/g)) {
    const end = match.index + match[0].trimEnd().length;
    const lastWord = text.slice(start, end).split(/\s+/).pop().replace(/^["'“‘(]+/, '');
    if (ABBREVIATIONS.has(lastWord.toLowerCase()) || /^[A-Z]\.$/.test(lastWord)) continue;
    out.push(text.slice(start, end));
    start = match.index + match[0].length;
  }
  if (start < text.length) out.push(text.slice(start));
  return out.filter((s) => s.trim());
}

/**
 * A fragment starts lowercase or stops without terminal punctuation. Two
 * evidenced exceptions, both real sentence ends: a closing quote/paren after
 * the stop ("...guards it.)") and a trailing evidence marker (◐ ✅ ⚠ 🔢).
 */
export function isFragment(text) {
  return /^[a-z]/.test(text) || !/[.!?…]["'”’)\]]*(?:\s*[◐✅⚠🔢]️?)*$/u.test(text);
}

/** Remove the meta block, fenced code, and multi-line JSX components; mark each cut with STRIPPED. */
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
      if (fence) kept.push(STRIPPED);
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
      kept.push(STRIPPED);
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

/**
 * Split one heading's prose into windows of about MAX_WORDS. Whole paragraphs
 * when they fit; an oversize paragraph goes in sentence by sentence. Never cuts
 * inside a sentence: one longer than MAX_WORDS gets a window to itself and is
 * allowed to run long (a whole thought beats a tidy word count). Never breaks
 * right after a "here's the list:" sentence either, so it keeps its list.
 */
function windows(paragraphs) {
  const units = paragraphs.flatMap((p) => (words(p).length > MAX_WORDS ? splitSentences(p) : [p]));
  const out = [];
  let current = [];
  let count = 0;
  while (units.length > 0) {
    const unit = units.shift();
    const size = words(unit).length;
    const leadIn = current.length > 0 && current[current.length - 1].endsWith(':');
    if (count > 0 && count + size > MAX_WORDS) {
      if (leadIn) {
        // Bring along just the first sentence of what the lead-in introduces.
        const parts = splitSentences(unit);
        if (parts.length > 1) {
          units.unshift(...parts);
          continue;
        }
      } else {
        out.push(current.join(' '));
        current = [];
        count = 0;
      }
    }
    current.push(unit);
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
  // "Watch the requests stream through:" introduces a diagram, code, or the next
  // heading. Once that's gone the sentence points at nothing, so drop it. The
  // paragraph is checked whole (wrapped lines already joined), never line by line;
  // a paragraph that was only the lead-in disappears entirely.
  const dropDanglingLeadIn = () => {
    flushParagraph();
    const last = paragraphs[paragraphs.length - 1];
    if (!last?.endsWith(':')) return;
    const kept = splitSentences(last).slice(0, -1).join(' ');
    if (kept) paragraphs[paragraphs.length - 1] = kept;
    else paragraphs.pop();
  };
  const flushSection = () => {
    dropDanglingLeadIn();
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
    if (line === STRIPPED) {
      finishItem();
      dropDanglingLeadIn();
      continue;
    }
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
    // A table row is one sentence too; the |---| divider row is just furniture.
    if (trimmed.startsWith('|')) {
      finishItem();
      if (/^[|\s:-]+$/.test(trimmed)) continue;
      const row = stripMarkdown(trimmed);
      if (row) para.push(/[.!?…]$/.test(row) ? row : `${row}.`);
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
