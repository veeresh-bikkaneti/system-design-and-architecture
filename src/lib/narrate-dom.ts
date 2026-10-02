/**
 * Browser-only DOM helpers for narration highlighting.
 *
 * These mutate the rendered lesson DOM (wrapping words/sentences in spans),
 * so they live apart from the pure helpers in `./narration` and must only
 * run in the browser — never during the build-time prerender. Components
 * call them; unit tests cover the pure planning functions they build on.
 */

import { planWordSpans } from './narration';

export const WORD_SPAN_CLASS = 'narr-word';
export const WORD_ACTIVE_CLASS = 'narr-word-active';
export const BLOCK_ACTIVE_CLASS = 'narr-block-active';
export const SENT_SPAN_CLASS = 'narr-sent';
export const SENT_ACTIVE_CLASS = 'narr-sent-active';

/**
 * Bring a block into view after an explicit jump (seek / read-from-here).
 * Centered, since the learner chose to land here; reduced-motion users get
 * an instant jump instead of a smooth scroll.
 */
export function scrollBlockIntoView(el: Element, reducedMotion: boolean): void {
  el.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
}

/** All descendant text nodes of `el`, in document order. */
export function textNodesIn(el: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    nodes.push(node as Text);
  }
  return nodes;
}

/**
 * Wrap each word of `words` (in order) in a `<span class="narr-word"
 * data-narr-idx="<flatIndex>">`, consuming the element's text nodes left to
 * right. `flatIndexOf(wordPosition)` maps the block-local word position to
 * the global flat-word index used for O(1) highlight lookup.
 *
 * Returns `true` on success. On any mismatch the element is restored and
 * `false` is returned — the caller should fall back to whole-block
 * highlighting instead of showing wrong words lit up.
 */
export function wrapWordSpans(
  el: Element,
  words: readonly string[],
  flatIndexOf: (wordPosition: number) => number,
): boolean {
  const created: HTMLSpanElement[] = [];
  const rollback = () => {
    for (const span of created) {
      span.replaceWith(document.createTextNode(span.textContent ?? ''));
    }
  };

  let consumed = 0;
  for (const textNode of textNodesIn(el)) {
    const plan = planWordSpans(textNode.textContent ?? '', words.slice(consumed));
    if (!plan) {
      rollback();
      return false;
    }
    const frag = document.createDocumentFragment();
    for (const part of plan.parts) {
      if (part.kind === 'gap') {
        frag.appendChild(document.createTextNode(part.text));
      } else {
        const span = document.createElement('span');
        span.className = WORD_SPAN_CLASS;
        span.dataset.narrIdx = String(flatIndexOf(consumed));
        span.textContent = part.text;
        frag.appendChild(span);
        created.push(span);
        consumed += 1;
      }
    }
    textNode.replaceWith(frag);
  }

  if (consumed !== words.length) {
    rollback();
    return false;
  }
  return true;
}

/**
 * Wrap each sentence of `sentences` (in order, derived from the element's
 * own textContent) in a `<span class="narr-sent" data-narr-sent="<i>">`.
 * Used by the Web Speech fallback for sentence-level highlighting.
 * Returns `false` (leaving the element untouched) if a sentence can't be
 * located — the caller then highlights the whole block instead.
 */
export function wrapSentenceSpans(el: Element, sentences: readonly string[]): boolean {
  const full = el.textContent ?? '';
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const s of sentences) {
    const at = full.indexOf(s, cursor);
    if (at === -1) return false;
    ranges.push({ start: at, end: at + s.length });
    cursor = at + s.length;
  }

  // Map char ranges onto text nodes.
  const nodes = textNodesIn(el);
  const created: HTMLSpanElement[] = [];
  let nodeStart = 0;
  let r = 0;
  for (const textNode of nodes) {
    const text = textNode.textContent ?? '';
    const nodeEnd = nodeStart + text.length;
    const frag = document.createDocumentFragment();
    let pos = 0; // offset inside this text node
    while (r < ranges.length && ranges[r].start < nodeEnd) {
      const range = ranges[r];
      const s = Math.max(range.start - nodeStart, 0);
      const e = Math.min(range.end - nodeStart, text.length);
      if (s > pos) frag.appendChild(document.createTextNode(text.slice(pos, s)));
      if (e > s) {
        const span = document.createElement('span');
        span.className = SENT_SPAN_CLASS;
        span.dataset.narrSent = String(r);
        span.textContent = text.slice(s, e);
        frag.appendChild(span);
        created.push(span);
      }
      pos = e;
      if (range.end <= nodeEnd) r += 1;
      else break;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    textNode.replaceWith(frag);
    nodeStart = nodeEnd;
  }
  return r === ranges.length;
}

/** Remove all spans of `spanClass` inside `root`, restoring plain text. */
export function unwrapSpans(root: ParentNode, spanClass: string): void {
  const spans = root.querySelectorAll(`span.${spanClass}`);
  spans.forEach((span) => {
    span.replaceWith(document.createTextNode(span.textContent ?? ''));
  });
  // Merge adjacent text nodes left behind by unwrapping.
  root.normalize();
}
