import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DIAGRAM_PRELOAD_MARGIN,
  lazyMdx,
  observeNearViewport,
} from './lazyMdx';

type EntryCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;

/** Minimal fake: captures the callback + options, lets tests drive entries. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: EntryCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: EntryCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((e) => e !== el);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire(entries: Partial<IntersectionObserverEntry>[]) {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

function installFakeObserver() {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('observeNearViewport', () => {
  it('observes the element with the preload margin and waits for intersection', () => {
    installFakeObserver();
    const el = {} as Element;
    let calls = 0;
    observeNearViewport(el, () => {
      calls++;
    });

    const io = FakeIntersectionObserver.instances[0];
    expect(io.observed).toEqual([el]);
    expect(io.options).toEqual({ rootMargin: DIAGRAM_PRELOAD_MARGIN });
    expect(calls).toBe(0);

    // Non-intersecting entries (still far away) must not trigger loading.
    io.fire([{ isIntersecting: false }]);
    expect(calls).toBe(0);
    expect(io.disconnected).toBe(false);
  });

  it('fires onNear exactly once, on the first intersecting entry, then disconnects', () => {
    installFakeObserver();
    const el = {} as Element;
    let calls = 0;
    observeNearViewport(el, () => {
      calls++;
    });

    const io = FakeIntersectionObserver.instances[0];
    io.fire([{ isIntersecting: true }]);
    expect(calls).toBe(1);
    expect(io.disconnected).toBe(true);
  });

  it('honors a custom rootMargin', () => {
    installFakeObserver();
    observeNearViewport({} as Element, () => {}, '100px');
    expect(FakeIntersectionObserver.instances[0].options).toEqual({
      rootMargin: '100px',
    });
  });

  it('returns a cleanup that disconnects the observer', () => {
    installFakeObserver();
    const cleanup = observeNearViewport({} as Element, () => {});
    const io = FakeIntersectionObserver.instances[0];
    cleanup();
    expect(io.disconnected).toBe(true);
  });

  it('fires immediately when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    let calls = 0;
    const cleanup = observeNearViewport({} as Element, () => {
      calls++;
    });
    expect(calls).toBe(1);
    // Cleanup must be safe to call even without a real observer.
    expect(() => cleanup()).not.toThrow();
  });
});

describe('lazyMdx', () => {
  it('sets a descriptive displayName', () => {
    const C = lazyMdx(() => Promise.resolve({ default: () => null }), 'diagram');
    expect(C.displayName).toBe('LazyMdx(diagram)');
  });

  it('does NOT start the dynamic import on render — only the placeholder renders', () => {
    // SSR path: effects never run, so the import must not fire at render
    // time. This is the P1-14 regression guard: previously React.lazy began
    // the import as soon as the component rendered.
    let loaderCalls = 0;
    const loader = () => {
      loaderCalls++;
      return Promise.resolve({
        default: () => createElement('div', null, 'real diagram'),
      });
    };
    const LazyDiagram = lazyMdx(loader, 'diagram');

    const html = renderToStaticMarkup(
      createElement(LazyDiagram, { code: 'flowchart TD' }),
    );

    expect(loaderCalls).toBe(0);
    expect(html).toContain('Loading diagram…');
    expect(html).not.toContain('real diagram');
  });

  it('renders the label-specific placeholder for each diagram', () => {
    const LazyPacketFlow = lazyMdx(
      () => Promise.resolve({ default: () => null }),
      'packet flow',
    );
    const html = renderToStaticMarkup(createElement(LazyPacketFlow, {}));
    expect(html).toContain('Loading packet flow…');
  });
});
