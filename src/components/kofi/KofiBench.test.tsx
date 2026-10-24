// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KofiBench } from './KofiBench';
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
