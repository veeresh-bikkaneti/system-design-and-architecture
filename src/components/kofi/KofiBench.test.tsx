// @vitest-environment jsdom
import { act, cleanup, render, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { KofiBenchCard, KofiBenchDock, KofiBenchSidebar } from './KofiBench';
import { Layout } from '../Layout';

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

function stubMatchMedia(matches: (query: string) => boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: matches(query),
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

/** Stub matchMedia so the shared desktop query (min-width: 1024px) matches. */
function stubDesktopViewport() {
  stubMatchMedia((query) => query.includes('min-width: 1024px'));
}

/** Stub matchMedia so the shared desktop query does not match. */
function stubBelowDesktopViewport() {
  stubMatchMedia(() => false);
}

beforeEach(() => {
  setOnline(true);
  vi.stubEnv('VITE_KOFI_URL', KOFI_URL);
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
    const { container } = render(<KofiBenchSidebar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when VITE_KOFI_URL is only whitespace', () => {
    vi.stubEnv('VITE_KOFI_URL', '   ');
    const { container } = render(<KofiBenchSidebar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while offline', () => {
    setOnline(false);
    const { container } = render(<KofiBenchSidebar />);
    expect(container.firstChild).toBeNull();
  });
});

describe('KofiBench ask and confirm', () => {
  it('shows the seated ask cloud with the locked copy once he sits', async () => {
    render(<KofiBenchSidebar />);
    await awaitAsk();
    expect(screen.getByText('Your refill keeps this course free.')).toBeTruthy();
    expect(screen.getByTestId('kofi-bench-scene')).toBeTruthy();
  });

  it('swaps the same cloud to the confirm on tap — no second dialog', async () => {
    const user = userEvent.setup();
    render(<KofiBenchSidebar />);
    await awaitAsk();
    await user.click(screen.getByRole('button', { name: /This course runs on coffee/ }));
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
    expect(screen.getByText('The course is free, and stays free. A coffee is just a thank-you.')).toBeTruthy();
    expect(screen.queryByText(ASK)).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('tapping grandpa also opens the confirm', async () => {
    const user = userEvent.setup();
    render(<KofiBenchSidebar />);
    await awaitAsk();
    await user.click(screen.getByRole('button', { name: /grandpa/i }));
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
  });

  it('Continue opens the env URL in a new tab with noopener,noreferrer, then returns to the ask', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<KofiBenchSidebar />);
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
    render(<KofiBenchSidebar />);
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
    render(<KofiBenchSidebar />);
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
    const { container } = render(<KofiBenchSidebar />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    await awaitAsk();
  });

  it('withholds the cloud until he sits, and grandpa is inert before that', async () => {
    const user = userEvent.setup();
    render(<KofiBenchSidebar />);
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
      const { container } = render(<fresh.KofiBenchSidebar />);
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
    render(<KofiBenchSidebar />);
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

// Placement contract rewritten for the grandpa-placement council ruling
// (2026-10-27). It replaces the 2026-10-24 suites "placement + Q&A yield"
// and "placement plan (2026-10-24)": the fixed overlay, the home-route
// CTA latch, and the <650px Q&A yield they pinned are retired — there is
// no overlay left to compensate for. One grandpa per page, JS-rendered
// (never CSS-hidden), three mutually exclusive mounts driven by the one
// shared (min-width: 1024px) hook: sidebar footer on desktop (all
// routes), in-flow card at the end of <main> below desktop on
// non-lesson routes, and the existing dock on lessons below desktop.
describe('KofiBench placement (council ruling, 2026-10-27)', () => {
  it('the sidebar variant is in-flow — no fixed positioning remains', () => {
    render(<KofiBenchSidebar />);
    const el = screen.getByTestId('kofi-bench-scene');
    expect(el.className).toContain('relative');
    expect(el.className).not.toContain('fixed');
    expect(el.className).toContain('w-[212px]');
    expect(el.className).toContain('items-start');
  });

  it('the sidebar variant reserves the maximum (confirm-state) height from first paint', () => {
    render(<KofiBenchSidebar />);
    const el = screen.getByTestId('kofi-bench-scene');
    expect(el.className).toMatch(/min-h-\[\d+px\]/);
  });

  it('the sidebar cloud is in-flow with its tail over grandpa, on the ≥3:1 border token', async () => {
    render(<KofiBenchSidebar />);
    await awaitAsk();
    const askButton = screen.getByRole('button', { name: /This course runs on coffee/ });
    expect(askButton.className).toContain('relative');
    expect(askButton.className).toContain('mb-1');
    // Border fix (owner-approved): stone-500 is the closest stone token
    // reaching ≥3:1 against the adjacent page background in BOTH themes
    // (light stone-400 = 2.41:1 fails; dark stone-600 = 2.59:1 fails).
    expect(askButton.className).toContain('border-stone-500');
    expect(askButton.className).not.toContain('border-stone-200');
    const tail = askButton.querySelector('span[aria-hidden="true"]');
    expect(tail?.className).toContain('right-[52px]');
    expect(tail?.className).toContain('border-stone-500');
  });

  it('the confirm cloud carries the same ≥3:1 border token', async () => {
    const user = userEvent.setup();
    render(<KofiBenchSidebar />);
    await awaitAsk();
    await user.click(screen.getByRole('button', { name: /This course runs on coffee/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('border-stone-500');
    expect(dialog.className).not.toContain('border-stone-200');
  });

  it('the dock JS-unmounts at desktop width — the sidebar owns lessons there', () => {
    stubDesktopViewport();
    stubFakeIO();
    const { container } = render(<KofiBenchDock />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('kofi-bench-dock')).toBeNull();
    expect(screen.queryByTestId('kofi-bench-scene')).toBeNull();
  });

  it('the lesson dock is in-flow below desktop, mounts the figure when scrolled into view, then shows the cloud after the sit', async () => {
    stubBelowDesktopViewport();
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

  it('the card is IntersectionObserver-gated like the dock: placeholder first, scene in view', async () => {
    stubFakeIO();
    const { container } = render(<KofiBenchCard />);
    expect(screen.getByTestId('kofi-bench-card')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
    expect(container.querySelector('svg')).toBeTruthy();
    await awaitAsk();
    const scene = screen.getByTestId('kofi-bench-scene');
    // In-flow card: the retired fixed overlay classes must not survive,
    // and the existing max-[480px] mobile size is the compact sizing.
    expect(scene.className).not.toContain('fixed');
    expect(scene.className).toContain('max-[480px]:w-[196px]');
    expect(scene.className).toContain('max-w-full');
  });

  it('the card cloud tail uses the fixed-bench in-flow positions (right-[52px], right-10 on small phones)', async () => {
    stubFakeIO();
    render(<KofiBenchCard />);
    act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
    await awaitAsk();
    const askButton = screen.getByRole('button', { name: /This course runs on coffee/ });
    const tail = askButton.querySelector('span[aria-hidden="true"]');
    expect(tail?.className).toContain('right-[52px]');
    expect(tail?.className).toContain('max-[480px]:right-10');
  });
});

describe('grandpa placement in the app shell (council ruling, 2026-10-27)', () => {
  function renderShell(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Home page</div>} />
            <Route path="lesson/:slug" element={<div>Lesson page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it('desktop home: exactly one grandpa, in the aside footer section, outside the nav landmark and DOM-after the nav links', async () => {
    stubDesktopViewport();
    const { container } = renderShell('/');
    const scene = await screen.findByTestId('kofi-bench-scene', {}, { timeout: 6000 });
    expect(screen.getAllByTestId('kofi-bench-scene')).toHaveLength(1);
    const aside = container.querySelector('aside');
    expect(aside?.contains(scene)).toBe(true);
    // Outside the navigation landmark: the ask must not corrupt
    // landmark navigation (it is not a nav link).
    expect(scene.closest('nav')).toBeNull();
    const section = aside?.querySelector('section[aria-label="Support this course"]');
    expect(section?.contains(scene)).toBe(true);
    // DOM-last in the aside: the footer section follows the nav region.
    const nav = aside?.querySelector('nav');
    expect(nav).toBeTruthy();
    expect(
      nav!.compareDocumentPosition(section!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The aside structure the ruling pins: flex-column sticky wrapper,
    // a flex:1 scrolling nav region, and the CSS-only short-viewport
    // degrade (wrapper becomes the scroll container under 700px tall).
    const wrapper = aside?.firstElementChild;
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('[@media(max-height:699px)]:overflow-y-auto');
    const navRegion = section?.previousElementSibling;
    expect(navRegion?.contains(nav!)).toBe(true);
    expect(navRegion?.className).toContain('flex-1');
    expect(navRegion?.className).toContain('min-h-0');
    expect(navRegion?.className).toContain('overflow-y-auto');
    expect(navRegion?.className).toContain('[@media(max-height:699px)]:flex-none');
    expect(section?.className).toContain('shrink-0');
  });

  it('desktop lesson route: the sidebar grandpa is the only one (dock unmounts at this width)', async () => {
    stubDesktopViewport();
    const { container } = renderShell('/lesson/scaling-web-service');
    const scene = await screen.findByTestId('kofi-bench-scene', {}, { timeout: 6000 });
    expect(screen.getAllByTestId('kofi-bench-scene')).toHaveLength(1);
    expect(container.querySelector('aside')?.contains(scene)).toBe(true);
    expect(container.querySelector('main')?.contains(scene)).toBe(false);
  });

  it('below desktop on a non-lesson route: exactly one grandpa — the in-flow card at the end of <main>, none in the aside', async () => {
    stubBelowDesktopViewport();
    stubFakeIO();
    const { container } = renderShell('/');
    const card = await screen.findByTestId('kofi-bench-card', {}, { timeout: 6000 });
    const main = container.querySelector('main');
    expect(main?.contains(card)).toBe(true);
    // The card sits at the END of <main>: after the routed page content.
    const pageContent = screen.getByText('Home page');
    expect(
      pageContent.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector('aside')?.contains(card)).toBe(false);
    act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
    const scene = await screen.findByTestId('kofi-bench-scene', {}, { timeout: 6000 });
    expect(screen.getAllByTestId('kofi-bench-scene')).toHaveLength(1);
    expect(main?.contains(scene)).toBe(true);
  });

  it('below desktop on a lesson route: the shell mounts no grandpa — the lesson dock (LessonPage) owns it', async () => {
    stubBelowDesktopViewport();
    stubFakeIO();
    renderShell('/lesson/scaling-web-service');
    // Give any lazy chunk the chance to mount before asserting absence.
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.queryByTestId('kofi-bench-scene')).toBeNull();
    expect(screen.queryByTestId('kofi-bench-card')).toBeNull();
  });
});

// Pacing rewritten for the ruling: pacing is a dock-only behaviour. The
// sidebar and card variants pass pace=false (2026-10-24 suite name: "dock
// pacing"); its fixed-bench case is rewritten against the sidebar and
// card mounts that replace the fixed bench.
describe('KofiBench pacing (council ruling, 2026-10-27)', () => {
  it('the dock grandpa paces while he waits — cloud hides while he is up, returns when he sits', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubBelowDesktopViewport();
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
      stubBelowDesktopViewport();
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

  it('the sidebar grandpa never paces, however long he sits', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubFakeIO();
      const fresh = await import('./KofiBench');
      const { container } = render(<fresh.KofiBenchSidebar />);
      const phase = () => container.querySelector('[data-phase]')?.getAttribute('data-phase');
      act(() => { vi.advanceTimersByTime(2700 + 400 + 3600 + 30000); });
      expect(phase()).toBe('seated');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the card grandpa never paces, however long he sits', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubFakeIO();
      const fresh = await import('./KofiBench');
      const { container } = render(<fresh.KofiBenchCard />);
      const phase = () => container.querySelector('[data-phase]')?.getAttribute('data-phase');
      act(() => FakeIO.instances.forEach((io) => io.trigger(true)));
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
      stubBelowDesktopViewport();
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
      stubBelowDesktopViewport();
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
      render(<KofiBenchSidebar />);
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
      render(<KofiBenchSidebar />);
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
      render(<KofiBenchSidebar />);
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
      render(<KofiBenchSidebar />);
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
      render(<KofiBenchSidebar />);
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
      const { unmount } = render(<KofiBenchSidebar />);
      await awaitAsk();
      await user.click(screen.getByRole('button', { name: /grandpa/i }));
      unmount();
      expect(created[0].pause).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
