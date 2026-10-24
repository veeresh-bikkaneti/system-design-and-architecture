// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KofiBench } from './KofiBench';
import { mountGrandpaScene } from './GrandpaScene';
import { useQaPanelStore } from '../../store/qaPanel';

// The 3D scene needs WebGL, which jsdom does not have: by default the mount
// "fails" (returns null) and KofiBench must fall back to the rendered still
// of the same grandpa — that fallback path is what most of this file
// exercises. The 3D-path tests override the mock with a fake handle and
// drive the entrance through the captured mount options (onSeated).
vi.mock('./GrandpaScene', () => ({
  mountGrandpaScene: vi.fn(() => null),
}));

const mountMock = vi.mocked(mountGrandpaScene);

const KOFI_URL = 'https://ko-fi.com/examplepage';
const ASK = 'This course runs on coffee. Care to buy me one?';

type MountOpts = Parameters<typeof mountGrandpaScene>[1];

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
  mountMock.mockReset();
  mountMock.mockReturnValue(null);
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
  it('shows the seated ask cloud with the locked copy from the start (fallback path)', async () => {
    render(<KofiBench />);
    await waitFor(() => expect(screen.getByText(ASK)).toBeTruthy());
    expect(screen.getByText('Your refill keeps this course free.')).toBeTruthy();
    expect(screen.getByTestId('kofi-bench-scene')).toBeTruthy();
  });

  it('swaps the same cloud to the confirm on tap — no second dialog', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    await waitFor(() => expect(screen.getByText(ASK)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /This course runs on coffee/ }));
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
    expect(screen.getByText('The course is free, and stays free. A coffee is just a thank-you.')).toBeTruthy();
    expect(screen.queryByText(ASK)).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('tapping grandpa also opens the confirm', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    await user.click(screen.getByRole('button', { name: /grandpa/i }));
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
  });

  it('Continue opens the env URL in a new tab with noopener,noreferrer, then returns to the ask', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<KofiBench />);
    await waitFor(() => expect(screen.getByText(ASK)).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText(ASK)).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText(ASK)).toBeTruthy());
    const askButton = screen.getByRole('button', { name: /This course runs on coffee/ });
    await user.click(askButton);
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.getByText(ASK)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /This course runs on coffee/ }));
  });
});

describe('KofiBench grandpa figure (3D scene + rendered-still fallback)', () => {
  it('falls back to the rendered still of the same grandpa — never an SVG figure — when the scene cannot mount', async () => {
    const { container } = render(<KofiBench />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toContain('grandpa-seated');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('shows the canvas, withholds the cloud until seated, then plays the refill once and disposes on unmount', async () => {
    const playRefill = vi.fn();
    const dispose = vi.fn();
    let opts: MountOpts | undefined;
    mountMock.mockImplementation((_canvas, o) => {
      opts = o;
      return { playRefill, dispose };
    });
    const { container, unmount } = render(<KofiBench />);
    await waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    // Mid-entrance: no cloud, and tapping grandpa does not open the confirm.
    expect(screen.queryByText(ASK)).toBeNull();
    expect(playRefill).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Buy Grandpa a coffee on Ko-fi' }));
    expect(screen.queryByText("You're heading to Ko-fi.")).toBeNull();
    // He sits: the cloud appears and the once-per-load refill follows.
    act(() => opts?.onSeated?.());
    expect(screen.getByText(ASK)).toBeTruthy();
    await waitFor(() => expect(playRefill).toHaveBeenCalledTimes(1));
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('falls back to the rendered still when the scene reports a lost WebGL context', async () => {
    let capturedOpts: MountOpts | undefined;
    mountMock.mockImplementation((_canvas, opts_) => {
      capturedOpts = opts_;
      return { playRefill: vi.fn(), dispose: vi.fn() };
    });
    const { container } = render(<KofiBench />);
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    expect(capturedOpts?.onContextLost).toBeTypeOf('function');
    act(() => capturedOpts?.onContextLost?.());
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy());
    expect(container.querySelector('svg')).toBeNull();
    // The fallback is seated by construction: the cloud shows immediately.
    expect(screen.getByText(ASK)).toBeTruthy();
  });
});

describe('KofiBench peer-review fixes', () => {
  it('returns focus to the grandpa figure when the figure opened the confirm', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    const figureButton = screen.getByRole('button', { name: 'Buy Grandpa a coffee on Ko-fi' });
    await user.click(figureButton);
    expect(screen.getByText("You're heading to Ko-fi.")).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(ASK)).toBeTruthy();
    // The figure button never unmounts, so focus must land back on it —
    // not on the ask cloud button, which is what the old code always did.
    expect(document.activeElement).toBe(figureButton);
  });

  it('does not replay the refill when the figure remounts after an offline→online toggle', async () => {
    const playRefill = vi.fn();
    const dispose = vi.fn();
    let latestOpts: MountOpts | undefined;
    mountMock.mockImplementation((_canvas, o) => {
      latestOpts = o;
      return { playRefill, dispose };
    });
    const { container } = render(<KofiBench />);
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    act(() => latestOpts?.onSeated?.());
    // Settle past the post-sit refill beat, then take the baseline. (The
    // once-per-load flag is module scope: if an earlier test in this file
    // already latched it, the baseline here is legitimately 0 — what this
    // test proves is that the remount does not ADD a call.)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    const callsAfterFirstSit = playRefill.mock.calls.length;
    // Offline: the whole bench unmounts (fail-closed). Online: it remounts.
    // The refill is once per page load, so a remount must not replay it.
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.queryByTestId('kofi-bench-scene')).toBeNull();
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    act(() => latestOpts?.onSeated?.());
    // Give a (wrongly) rescheduled refill time to fire, then compare.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    expect(playRefill.mock.calls.length).toBe(callsAfterFirstSit);
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
