import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORD_SPAN_CLASS,
  unwrapSpans,
  wrapWordSpans,
} from './narrate-dom';

/* ------------------------------------------------------------------ */
/* Minimal fake DOM (no jsdom in this repo): just enough for the word   */
/* tagger — text nodes, tree walker, spans, fragments, replaceWith.     */
/* ------------------------------------------------------------------ */

type FakeKid = FakeText | FakeElement;

class FakeText {
  readonly nodeType = 3;
  textContent: string;
  parent: FakeElement | FakeFragment | null = null;

  constructor(text: string) {
    this.textContent = text;
  }

  replaceWith(...nodes: Array<FakeText | FakeElement | FakeFragment>): void {
    const parent = this.parent;
    if (!parent) return;
    const kids = parent.children;
    const at = kids.indexOf(this);
    const flat: FakeKid[] = [];
    for (const n of nodes) {
      if (n instanceof FakeFragment) flat.push(...n.children);
      else flat.push(n);
    }
    for (const n of flat) n.parent = parent;
    kids.splice(at, 1, ...flat);
    this.parent = null;
  }
}

class FakeFragment {
  readonly children: FakeKid[] = [];

  appendChild<T extends FakeKid>(node: T): T {
    node.parent = this;
    this.children.push(node);
    return node;
  }
}

class FakeElement {
  readonly nodeType = 1;
  readonly tagName: string;
  readonly children: FakeKid[] = [];
  parent: FakeElement | FakeFragment | null = null;
  className = '';
  readonly dataset: Record<string, string> = {};

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get textContent(): string {
    return this.children.map((c) => c.textContent).join('');
  }

  set textContent(value: string) {
    this.children.length = 0;
    this.appendChild(new FakeText(value));
  }

  appendChild<T extends FakeKid>(node: T): T {
    node.parent = this;
    this.children.push(node);
    return node;
  }

  replaceWith(...nodes: Array<FakeText | FakeElement | FakeFragment>): void {
    const parent = this.parent;
    if (!parent) return;
    const kids = parent.children;
    const at = kids.indexOf(this);
    const flat: FakeKid[] = [];
    for (const n of nodes) {
      if (n instanceof FakeFragment) flat.push(...n.children);
      else flat.push(n);
    }
    for (const n of flat) n.parent = parent;
    kids.splice(at, 1, ...flat);
    this.parent = null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const [tag, cls] = selector.split('.');
    const found: FakeElement[] = [];
    const walk = (el: FakeElement): void => {
      for (const kid of el.children) {
        if (kid instanceof FakeElement) {
          const tagOk =
            !tag || kid.tagName.toLowerCase() === tag.toLowerCase();
          const clsOk =
            !cls || kid.className.split(/\s+/).includes(cls);
          if (tagOk && clsOk) found.push(kid);
          walk(kid);
        }
      }
    };
    walk(this);
    return found;
  }

  /** Merge adjacent text nodes, like DOM normalize(). */
  normalize(): void {
    const merged: FakeKid[] = [];
    for (const kid of this.children) {
      if (kid instanceof FakeElement) kid.normalize();
      const prev = merged[merged.length - 1];
      if (kid instanceof FakeText && prev instanceof FakeText) {
        prev.textContent += kid.textContent;
      } else {
        merged.push(kid);
      }
    }
    this.children.length = 0;
    for (const kid of merged) {
      kid.parent = this;
      this.children.push(kid);
    }
  }
}

const asElement = (el: FakeElement): Element => el as unknown as Element;

const installFakeDom = (): void => {
  const fakeDocument = {
    createTreeWalker: (root: FakeElement) => {
      const texts: FakeText[] = [];
      const walk = (el: FakeElement): void => {
        for (const kid of el.children) {
          if (kid instanceof FakeText) texts.push(kid);
          else walk(kid);
        }
      };
      walk(root);
      let i = 0;
      return {
        nextNode: (): FakeText | null => (i < texts.length ? texts[i++] : null),
      };
    },
    createElement: (tag: string) => new FakeElement(tag),
    createDocumentFragment: () => new FakeFragment(),
    createTextNode: (text: string) => new FakeText(text),
  };
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 });
};

beforeEach(() => {
  installFakeDom();
});

const wordSpans = (el: FakeElement): FakeElement[] =>
  el.querySelectorAll(`span.${WORD_SPAN_CLASS}`);

describe('wrapWordSpans', () => {
  it('wraps every word and preserves the display text', () => {
    const p = new FakeElement('p');
    p.appendChild(new FakeText('Hello, brave world!'));
    const ok = wrapWordSpans(asElement(p), ['Hello', 'brave', 'world'], (pos) => pos);
    expect(ok).toBe(true);
    expect(wordSpans(p).map((s) => s.textContent)).toEqual([
      'Hello',
      'brave',
      'world',
    ]);
    expect(wordSpans(p).map((s) => s.dataset.narrIdx)).toEqual(['0', '1', '2']);
    expect(p.textContent).toBe('Hello, brave world!');
  });

  it('wraps spoken expansions: the written symbol lights up for its spoken word', () => {
    // The manifest holds spoken-form words ("about 10x"); the DOM holds
    // "~10x". The "~" span carries flat index 0 ("about").
    const p = new FakeElement('p');
    p.appendChild(new FakeText('~10x of traffic'));
    const words = ['about', '10x', 'of', 'traffic'];
    const ok = wrapWordSpans(asElement(p), words, (pos) => pos + 100);
    expect(ok).toBe(true);
    const spans = wordSpans(p);
    expect(spans.map((s) => s.textContent)).toEqual(['~', '10x', 'of', 'traffic']);
    expect(spans.map((s) => s.dataset.narrIdx)).toEqual(['100', '101', '102', '103']);
    expect(p.textContent).toBe('~10x of traffic');
  });

  it('matches expansions across inline element boundaries', () => {
    const p = new FakeElement('p');
    p.appendChild(new FakeText('Serves '));
    const em = new FakeElement('em');
    em.appendChild(new FakeText('~5k'));
    p.appendChild(em);
    p.appendChild(new FakeText(' requests'));
    const words = ['Serves', 'about', '5k', 'requests'];
    expect(wrapWordSpans(asElement(p), words, (pos) => pos)).toBe(true);
    expect(wordSpans(p).map((s) => s.textContent)).toEqual([
      'Serves',
      '~',
      '5k',
      'requests',
    ]);
    expect(p.textContent).toBe('Serves ~5k requests');
  });

  it('rolls back and returns false on mismatch, leaving the DOM untouched', () => {
    const p = new FakeElement('p');
    p.appendChild(new FakeText('hello mars'));
    expect(wrapWordSpans(asElement(p), ['hello', 'world'], (pos) => pos)).toBe(false);
    expect(wordSpans(p)).toHaveLength(0);
    expect(p.textContent).toBe('hello mars');
  });

  it('rolls back when an expansion word is missing from the manifest', () => {
    // DOM "~5" needs ["about","5"]; without "about" the block must not
    // half-tag — the caller falls back to whole-block highlighting.
    const p = new FakeElement('p');
    p.appendChild(new FakeText('~5'));
    expect(wrapWordSpans(asElement(p), ['5'], (pos) => pos)).toBe(false);
    expect(wordSpans(p)).toHaveLength(0);
    expect(p.textContent).toBe('~5');
  });
});

describe('unwrapSpans', () => {
  it('removes word spans and restores the plain text', () => {
    const p = new FakeElement('p');
    p.appendChild(new FakeText('~10x of traffic'));
    expect(
      wrapWordSpans(asElement(p), ['about', '10x', 'of', 'traffic'], (pos) => pos),
    ).toBe(true);
    expect(wordSpans(p)).toHaveLength(4);
    unwrapSpans(asElement(p) as unknown as ParentNode, WORD_SPAN_CLASS);
    expect(wordSpans(p)).toHaveLength(0);
    expect(p.textContent).toBe('~10x of traffic');
  });
});
