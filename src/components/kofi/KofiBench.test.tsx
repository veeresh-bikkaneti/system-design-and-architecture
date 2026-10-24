// @vitest-environment jsdom
import { act, cleanup, render, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryRouter } from 'react-router-dom';

import { KofiBench, KofiBenchDock, KofiBenchGate } from './KofiBench';
import { useQaPanelStore } from '../../store/qaPanel';

// The figure is a flat 2D animated SVG (the owner's design reference) —
// no WebGL, no mocks. He walks in and sits on a timer (2.7s), so tests
// that need the cloud await it with a generous timeout.

const KOFI_URL = 'https://ko-fi.com/examplepage';
const ASK = 'This course runs on coffee. Care to buy me one?';

/** The cloud appears only once grandpa is seated (~2.7s of walk + sit). */
async function awaitAsk() {
  await waitFor(() => expect(screen.getByText(ASK)).toBeTruthy(), { timeout: 6000 });
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

/** Controllable IntersectionObserver: tests fire the callback by hand. */
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

function stubFakeIO() {
  FakeIO.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIO);
}

/** Stub matchMedia so the below-desktop query (max-width: 1023px) matches. */
function stubMobileViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('max-width: 1023px'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/** Stub matchMedia so only the narrow-viewport query matches. */
function stubNarrowViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('max-width: 649px'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  setOnline(true);
  vi.stubEnv('VITE_KOFI_URL', KOFI_URL);
  act(() => useQaPanelStore.setState({ open: false }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('KofiBench gates', () => {
  it('renders nothing when VITE_KOFI_URL is unset', () => {
    vi.stubEnv('VITE_KOFI_URL', '');
    const { container } = render(<KofiBench />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when VITE_KOFI_URL is only whitespace', () => {
    vi.stubEnv('VITE_KOFI_URL', '   ');
    const { container } = render(<KofiBench />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while offline', () => {
    setOnline(false);
    const { container } = render(<KofiBench />);
    expect(container.firstChild).toBeNull();
  });
});

describe('KofiBench ask and confirm', () => {
  it('shows the seated ask cloud with the locked copy once he sits', async () => {
    render(<KofiBench />);
    await awaitAsk();
    expect(screen.getByText('Your refill keeps this course free.')).toBeTruthy();
    expect(screen.getByTestId('kofi-bench-scene')).toBeTruthy();
  });

  it('swaps the same cloud to the confirm on tap — no second dialog', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    await awaitAsk();
    await user.click(screen.getByRole('button', { name: /This course runs on coffee/ }));
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
    expect(screen.getByText('The course is free, and stays free. A coffee is just a thank-you.')).toBeTruthy();
    expect(screen.queryByText(ASK)).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('tapping grandpa also opens the confirm', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    await awaitAsk();
    await user.click(screen.getByRole('button', { name: /grandpa/i }));
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
  });

  it('Continue opens the env URL in a new tab with noopener,noreferrer, then returns to the ask', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<KofiBench />);
    await awaitAsk();
    await user.click(screen.getByRole('button', { name: /This course runs on coffee/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(KOFI_URL, '_blank', 'noopener,noreferrer');
    expect(screen.getByText(ASK)).toBeTruthy();
  });

  it('Cancel returns to the ask, opens nothing, and focus returns to the ask button', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<KofiBench />);
    await awaitAsk();
    const askButton = screen.getByRole('button', { name: /This course runs on coffee/ });
    await user.click(askButton);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText(ASK)).toBeTruthy();
    // The ask button remounts when the cloud swaps back — focus must land
    // on the fresh instance, not the pre-confirm element.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /This course runs on coffee/ }));
  });

  it('Escape closes the confirm and focus returns to the ask button', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    await awaitAsk();
    const askButton = screen.getByRole('button', { name: /This course runs on coffee/ });
    await user.click(askButton);
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.getByText(ASK)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /This course runs on coffee/ }));
  });
});

describe('KofiBench flat 2D grandpa', () => {
  it('renders the grandpa as a flat SVG — no canvas, no still image, no WebGL', async () => {
    const { container } = render(<KofiBench />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    await awaitAsk();
  });

  it('withholds the cloud until he sits, and grandpa is inert before that', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    expect(screen.queryByText(ASK)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Buy Grandpa a coffee on Ko-fi' }));
    expect(screen.queryByText("You're heading to Ko-fi.")).toBeNull();
    await awaitAsk();
  });

  it('plays the refill once per page load, and never replays it on an offline→online remount', async () => {
    // Fresh module registry: the once-per-load latch is module scope, so
    // this test imports its own copy of the bench and drives it with
    // fake timers through both mounts.
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const fresh = await import('./KofiBench');
      const { container } = render(<fresh.KofiBench />);
      const phase = () => container.querySelector('[data-phase]')?.getAttribute('data-phase');
      // Walk (2.2s) + sit (0.5s) land him; the refill follows a beat later.
      act(() => { vi.advanceTimersByTime(2700); });
      expect(phase()).toBe('seated');
      act(() => { vi.advanceTimersByTime(400); });
      expect(phase()).toBe('refilling');
      act(() => { vi.advanceTimersByTime(3600); });
      expect(phase()).toBe('seated');
      // Offline unmounts the figure; online remounts it. He walks and
      // sits again — but the refill must NOT replay.
      act(() => {
        setOnline(false);
        window.dispatchEvent(new Event('offline'));
      });
      expect(screen.queryByTestId('kofi-bench-scene')).toBeNull();
      act(() => {
        setOnline(true);
        window.dispatchEvent(new Event('online'));
      });
      act(() => { vi.advanceTimersByTime(2700 + 400 + 3600); });
      expect(phase()).toBe('seated');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('KofiBench peer-review fixes', () => {
  it('returns focus to the grandpa figure when the figure opened the confirm', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    await awaitAsk();
    const figureButton = screen.getByRole('button', { name: 'Buy Grandpa a coffee on Ko-fi' });
    await user.click(figureButton);
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(ASK)).toBeTruthy();
    // The figure button never unmounts, so focus must land back on it —
    // not on the ask cloud button, which is what the old code always did.
    expect(document.activeElement).toBe(figureButton);
  });
});

describe('KofiBench placement + Q&A yield', () => {
  it('anchors bottom-left, clear of the bottom-right Q&A corner', () => {
    render(<KofiBench />);
    const el = screen.getByTestId('kofi-bench-scene');
    expect(el.className).toContain('left-4');
    expect(el.className).not.toContain('right-4');
  });

  it('hides while the Q&A panel is open on a narrow viewport, and returns when it closes', async () => {
    stubNarrowViewport();
    render(<KofiBench />);
    const el = screen.getByTestId('kofi-bench-scene');
    expect(el.className).not.toContain('hidden');
    act(() => useQaPanelStore.setState({ open: true }));
    await waitFor(() => expect(screen.getByTestId('kofi-bench-scene').className).toContain('hidden'));
    act(() => useQaPanelStore.setState({ open: false }));
    await waitFor(() => expect(screen.getByTestId('kofi-bench-scene').className).not.toContain('hidden'));
  });

  it('stays visible beside the open Q&A panel on a wide viewport', () => {
    // No matchMedia stub: jsdom has none, the bench treats that as wide.
    act(() => useQaPanelStore.setState({ open: true }));
    render(<KofiBench />);
    expect(screen.getByTestId('kofi-bench-scene').className).not.toContain('hidden');
  });
});

describe('KofiBench placement plan (agency panel, 2026-10-24)', () => {
  it('the route gate renders nothing on lesson routes — the dock owns lessons', () => {
    render(
      <MemoryRouter initialEntries={['/lesson/scaling-web-service']}>
        <KofiBenchGate />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('kofi-bench-scene')).toBeNull();
  });

  it('the route gate renders the fixed bench on the home route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <KofiBenchGate />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('kofi-bench-scene')).toBeTruthy();
    await awaitAsk();
  });

  it('on mobile home, the bench waits until Start learning scrolls out of view, then appears', async () => {
    stubMobileViewport();
    stubFakeIO();
    render(
      <>
        <a href="/lesson/scaling-web-service">Start learning</a>
        <MemoryRouter initialEntries={['/']}>
          <KofiBenchGate />
        </MemoryRouter>
      </>,
    );
    // The CTA still owns the first viewport: no bench at all yet.
    expect(screen.queryByTestId('kofi-bench-scene')).toBeNull();
    // The CTA scrolls away — the bench may come in.
    act(() => FakeIO.instances.forEach((io) => io.trigger(false)));
    expect(screen.getByTestId('kofi-bench-scene')).toBeTruthy();
    await awaitAsk();
  });

  it('the lesson dock is in-flow, mounts the figure when scrolled into view, then shows the cloud after the sit', async () => {
    stubFakeIO();
    const { container } = render(<KofiBenchDock />);
    const dock = screen.getByTestId('kofi-bench-dock');
    expect(dock.className).not.toContain('fixed');
    // Not yet in view: no figure mounted (the walk must not play off-screen).
    expect(container.querySelector('svg')).toBeNull();
    act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
    expect(container.querySelector('svg')).toBeTruthy();
    await awaitAsk();
  });
});

describe('KofiBench dock pacing (owner: "waiting and walking around")', () => {
  it('the dock grandpa paces while he waits — cloud hides while he is up, returns when he sits', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubFakeIO();
      const fresh = await import('./KofiBench');
      const { container } = render(<fresh.KofiBenchDock />);
      const phase = () => container.querySelector('[data-phase]')?.getAttribute('data-phase');
      act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
      act(() => { vi.advanceTimersByTime(2700); }); // walk + sit
      expect(phase()).toBe('seated');
      expect(screen.getByText(ASK)).toBeTruthy();
      act(() => { vi.advanceTimersByTime(400 + 3600); }); // the refill plays out
      expect(phase()).toBe('seated');
      // Step the round, one act() per phase: each phase's timer is
      // scheduled by an effect that only flushes when the act() exits.
      const step = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
      step(15000); // idle long enough — he gets up
      expect(phase()).toBe('standing');
      expect(screen.queryByText(ASK)).toBeNull(); // the cloud waits with the bench
      step(500); // standing -> pacing-out
      step(1600); // pacing-out -> pause
      step(600); // pause -> pacing-back
      step(1600); // pacing-back -> sitting
      step(500); // sitting -> seated
      expect(phase()).toBe('seated');
      expect(screen.getByText(ASK)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the dock grandpa still paces on a later lesson visit, after the refill latch is spent', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubFakeIO();
      const fresh = await import('./KofiBench');
      const { container, unmount } = render(<fresh.KofiBenchDock />);
      const phase = () => container.querySelector('[data-phase]')?.getAttribute('data-phase');
      const step = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
      act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
      act(() => { vi.advanceTimersByTime(2700 + 400 + 3600); }); // first visit: walk, sit, refill
      expect(phase()).toBe('seated');
      unmount();
      const second = render(<fresh.KofiBenchDock />);
      const phase2 = () => second.container.querySelector('[data-phase]')?.getAttribute('data-phase');
      act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
      act(() => { vi.advanceTimersByTime(2700); }); // second visit: walk + sit, no refill
      expect(phase2()).toBe('seated');
      expect(screen.getByText(ASK)).toBeTruthy();
      step(15000);
      expect(phase2()).toBe('standing');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the fixed bench never paces, however long he sits', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubFakeIO();
      const fresh = await import('./KofiBench');
      const { container } = render(<fresh.KofiBench />);
      const phase = () => container.querySelector('[data-phase]')?.getAttribute('data-phase');
      act(() => { vi.advanceTimersByTime(2700 + 400 + 3600 + 30000); });
      expect(phase()).toBe('seated');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the dock grandpa never paces under reduced motion', async () => {
    vi.useFakeTimers();
    // Motion caches the reduced-motion preference in a module singleton
    // on first use (externalized dep — vi.resetModules cannot clear it),
    // so stubbing matchMedia after earlier tests is too late. Set the
    // singleton directly; it is the same instance the figure reads.
    const motionDom = await import('motion-dom');
    motionDom.prefersReducedMotion.current = true;
    try {
      vi.resetModules();
      stubFakeIO();
      const fresh = await import('./KofiBench');
      const { container } = render(<fresh.KofiBenchDock />);
      const phase = () => container.querySelector('[data-phase]')?.getAttribute('data-phase');
      act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
      expect(phase()).toBe('seated'); // seated from the start, no walk
      act(() => { vi.advanceTimersByTime(30000); });
      expect(phase()).toBe('seated');
    } finally {
      motionDom.prefersReducedMotion.current = false;
      vi.useRealTimers();
    }
  });

  it('the dock grandpa never paces while the confirm is open', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubFakeIO();
      const fresh = await import('./KofiBench');
      const { container } = render(<fresh.KofiBenchDock />);
      const phase = () => container.querySelector('[data-phase]')?.getAttribute('data-phase');
      // fireEvent, not userEvent: the async userEvent click timed out
      // under fake timers in the full suite (it passed alone). The click
      // only needs to fire onClick, so the synchronous dispatch is enough.
      act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
      act(() => { vi.advanceTimersByTime(2700 + 400 + 3600); });
      expect(phase()).toBe('seated');
      fireEvent.click(screen.getByRole('button', { name: /This course runs on coffee/ }));
      expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
      act(() => { vi.advanceTimersByTime(30000); });
      expect(phase()).toBe('seated');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('KofiBench greeting voice (owner: old male narrator)', () => {
  // jsdom ships no working audio: stand in for the Audio constructor so
  // the tests can see the URL played and count play/pause calls.
  function stubAudio() {
    const created: { src: string; currentTime: number; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = [];
    class FakeAudio {
      src: string;
      currentTime = 0;
      play = vi.fn(() => Promise.resolve());
      pause = vi.fn();
      constructor(src: string) {
        this.src = src;
        created.push(this);
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    return created;
  }

  it('tapping grandpa plays the greeting from the bench audio file', async () => {
    const created = stubAudio();
    try {
      const user = userEvent.setup();
      render(<KofiBench />);
      await awaitAsk();
      await user.click(screen.getByRole('button', { name: /grandpa/i }));
      expect(created).toHaveLength(1);
      expect(created[0].src).toMatch(/kofi-grandpa-greeting\.mp3$/);
      expect(created[0].play).toHaveBeenCalledTimes(1);
      expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('tapping the ask cloud also plays the greeting', async () => {
    const created = stubAudio();
    try {
      const user = userEvent.setup();
      render(<KofiBench />);
      await awaitAsk();
      await user.click(screen.getByRole('button', { name: /This course runs on coffee/ }));
      expect(created).toHaveLength(1);
      expect(created[0].play).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a figure re-tap while the confirm is open does not replay the greeting', async () => {
    const created = stubAudio();
    try {
      const user = userEvent.setup();
      render(<KofiBench />);
      await awaitAsk();
      const figure = screen.getByRole('button', { name: /grandpa/i });
      await user.click(figure);
      expect(created[0].play).toHaveBeenCalledTimes(1);
      await user.click(figure);
      expect(created[0].play).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Cancel stops the greeting', async () => {
    const created = stubAudio();
    try {
      const user = userEvent.setup();
      render(<KofiBench />);
      await awaitAsk();
      await user.click(screen.getByRole('button', { name: /grandpa/i }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(created[0].pause).toHaveBeenCalledTimes(1);
      expect(screen.getByText(ASK)).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Escape stops the greeting', async () => {
    const created = stubAudio();
    try {
      const user = userEvent.setup();
      render(<KofiBench />);
      await awaitAsk();
      await user.click(screen.getByRole('button', { name: /grandpa/i }));
      await user.keyboard('{Escape}');
      expect(created[0].pause).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('unmount stops the greeting', async () => {
    const created = stubAudio();
    try {
      const user = userEvent.setup();
      const { unmount } = render(<KofiBench />);
      await awaitAsk();
      await user.click(screen.getByRole('button', { name: /grandpa/i }));
      unmount();
      expect(created[0].pause).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
