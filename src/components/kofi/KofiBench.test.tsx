// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KofiBench } from './KofiBench';
import { mountGrandpaScene } from './GrandpaScene';

// The 3D scene needs WebGL, which jsdom does not have: by default the mount
// "fails" (returns null) and KofiBench must fall back to the SVG figure —
// that fallback path is what most of this file exercises. The 3D-path tests
// at the bottom override the mock with a fake handle.
vi.mock('./GrandpaScene', () => ({
  mountGrandpaScene: vi.fn(() => null),
}));

const mountMock = vi.mocked(mountGrandpaScene);

const KOFI_URL = 'https://ko-fi.com/examplepage';
const ASK = 'Students — buy me a coffee?';

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(() => {
  setOnline(true);
  vi.stubEnv('VITE_KOFI_URL', KOFI_URL);
  mountMock.mockReset();
  mountMock.mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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
  it('shows the seated ask cloud with the locked copy from the start', () => {
    render(<KofiBench />);
    expect(screen.getByText(ASK)).toBeTruthy();
    expect(screen.getByText('Your refill keeps this course free.')).toBeTruthy();
    expect(screen.getByTestId('kofi-bench-scene')).toBeTruthy();
  });

  it('swaps the same cloud to the confirm on tap — no second dialog', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    await user.click(screen.getByRole('button', { name: /Students — buy me a coffee/ }));
    expect(screen.getByText("You're leaving for Ko-fi.")).toBeTruthy();
    expect(screen.getByText('The course stays free. A coffee is optional.')).toBeTruthy();
    expect(screen.queryByText(ASK)).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('tapping grandpa also opens the confirm', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    await user.click(screen.getByRole('button', { name: /grandpa/i }));
    expect(screen.getByText("You're leaving for Ko-fi.")).toBeTruthy();
  });

  it('Continue opens the env URL in a new tab with noopener,noreferrer, then returns to the ask', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<KofiBench />);
    await user.click(screen.getByRole('button', { name: /Students — buy me a coffee/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(KOFI_URL, '_blank', 'noopener,noreferrer');
    expect(screen.getByText(ASK)).toBeTruthy();
  });

  it('Cancel returns to the ask, opens nothing, and focus returns to the ask button', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<KofiBench />);
    const askButton = screen.getByRole('button', { name: /Students — buy me a coffee/ });
    await user.click(askButton);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText(ASK)).toBeTruthy();
    // The ask button remounts when the cloud swaps back — focus must land
    // on the fresh instance, not the pre-confirm element.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Students — buy me a coffee/ }));
  });

  it('Escape closes the confirm and focus returns to the ask button', async () => {
    const user = userEvent.setup();
    render(<KofiBench />);
    const askButton = screen.getByRole('button', { name: /Students — buy me a coffee/ });
    await user.click(askButton);
    expect(screen.getByText("You're leaving for Ko-fi.")).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.getByText(ASK)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Students — buy me a coffee/ }));
  });
});

describe('KofiBench grandpa figure (3D scene + SVG fallback)', () => {
  it('falls back to the SVG figure when the 3D scene cannot mount', async () => {
    const { container } = render(<KofiBench />);
    await waitFor(() => expect(mountMock).toHaveBeenCalled());
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('shows the 3D canvas, plays the refill once, and disposes on unmount', async () => {
    const playRefill = vi.fn();
    const dispose = vi.fn();
    mountMock.mockReturnValue({ playRefill, dispose });
    const { container, unmount } = render(<KofiBench />);
    await waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());
    await waitFor(() => expect(container.querySelector('svg')).toBeNull());
    expect(playRefill).toHaveBeenCalledTimes(1);
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
