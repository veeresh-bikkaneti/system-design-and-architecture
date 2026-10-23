// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KofiBench } from './KofiBench';

const KOFI_URL = 'https://ko-fi.com/examplepage';
const ASK = 'Students — buy me a coffee?';

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(() => {
  setOnline(true);
  vi.stubEnv('VITE_KOFI_URL', KOFI_URL);
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
