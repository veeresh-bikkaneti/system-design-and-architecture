// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
  it('never imports the scene: the rendered still shows him seated, the ask is immediate, no walk, no refill', async () => {
    const { container } = render(<KofiBench />);
    // Seated from the start: the still of the same grandpa, no SVG, no canvas.
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toContain('grandpa-seated');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByText('This course runs on coffee. Care to buy me one?')).toBeTruthy();
    // Give the lazy scene import every chance to fire — it must not.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mountMock).not.toHaveBeenCalled();
    // The confirm still works end to end.
    await waitFor(() => expect(screen.getByText('This course runs on coffee. Care to buy me one?')).toBeTruthy());
  });
});
