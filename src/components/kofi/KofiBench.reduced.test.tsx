// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KofiBenchCard, KofiBenchSidebar } from './KofiBench';

// Reduced-motion coverage lives in its own file on purpose: Motion's
// useReducedMotion initializes once per module registry from matchMedia,
// so the stub below must be installed before the first render in this
// file's fresh registry.
beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  vi.stubEnv('VITE_KOFI_URL', 'https://ko-fi.com/examplepage');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

/** Controllable IntersectionObserver (the card mounts its figure in view). */
class FakeIO {
  static instances: FakeIO[] = [];
  cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    FakeIO.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  trigger(isIntersecting: boolean) {
    this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

describe('KofiBench under reduced motion', () => {
  it('the sidebar variant shows the flat grandpa already seated — no walk, no refill — and the ask is immediate', () => {
    const { container } = render(<KofiBenchSidebar />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('seated');
    expect(screen.getByText('This course runs on coffee. Care to buy me one?')).toBeTruthy();
  });

  it('the card variant shows the flat grandpa already seated once scrolled into view, and the ask is immediate', () => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
    try {
      const { container } = render(<KofiBenchCard />);
      act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
      expect(container.querySelector('svg')).toBeTruthy();
      expect(container.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('seated');
      expect(screen.getByText('This course runs on coffee. Care to buy me one?')).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
