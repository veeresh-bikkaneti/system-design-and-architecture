// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KofiBench } from './KofiBench';
import { mountGrandpaScene } from './GrandpaScene';

// Reduced-motion coverage lives in its own file on purpose: Motion's
// useReducedMotion initializes once per module registry from matchMedia,
// so the stub below must be installed before the first render in this
// file's fresh registry.
vi.mock('./GrandpaScene', () => ({
  mountGrandpaScene: vi.fn(() => null),
}));

const mountMock = vi.mocked(mountGrandpaScene);

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
  mountMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('KofiBench under reduced motion', () => {
  it('passes reduced motion to the scene and does not trigger the refill', async () => {
    const playRefill = vi.fn();
    mountMock.mockReturnValue({ playRefill, dispose: vi.fn() });
    const { container } = render(<KofiBench />);
    expect(screen.getByText('This course runs on coffee. Care to buy me one?')).toBeTruthy();
    // The SVG overlay disappears once the scene reports ready — by then
    // the refill decision has been made.
    await waitFor(() => expect(container.querySelector('svg')).toBeNull());
    expect(mountMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reducedMotion: true }),
    );
    expect(playRefill).not.toHaveBeenCalled();
  });
});
