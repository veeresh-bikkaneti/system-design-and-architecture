// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UpdatePrompt } from './UpdatePrompt';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Minimal controllable stand-ins for the Service Worker APIs. */
interface MockWorker {
  postMessage: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  state: string;
  listeners: Record<string, Array<(...args: Array<unknown>) => void>>;
  dispatch: (type: string) => void;
}

function mockWorker(): MockWorker {
  const listeners: Record<string, Array<(...args: Array<unknown>) => void>> = {};
  const worker: MockWorker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn((type: string, fn: (...args: Array<unknown>) => void) => {
      (listeners[type] ??= []).push(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: (...args: Array<unknown>) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    }),
    state: 'installed',
    listeners,
    dispatch: (type: string) => {
      for (const fn of [...(listeners[type] ?? [])]) fn();
    },
  };
  return worker;
}

interface MockRegistration {
  waiting: MockWorker | null;
  installing: MockWorker | null;
  active: MockWorker | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  listeners: Record<string, Array<(...args: Array<unknown>) => void>>;
  dispatch: (type: string) => void;
}

function mockRegistration(
  opts: Partial<Pick<MockRegistration, 'waiting' | 'installing' | 'active'>> = {},
): MockRegistration {
  const listeners: Record<string, Array<(...args: Array<unknown>) => void>> = {};
  const reg: MockRegistration = {
    waiting: opts.waiting ?? null,
    installing: opts.installing ?? null,
    active: opts.active ?? null,
    addEventListener: vi.fn((type: string, fn: (...args: Array<unknown>) => void) => {
      (listeners[type] ??= []).push(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: (...args: Array<unknown>) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    }),
    listeners,
    dispatch: (type: string) => {
      for (const fn of [...(listeners[type] ?? [])]) fn();
    },
  };
  return reg;
}

interface MockSW {
  controller: MockWorker | null;
  getRegistration: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  listeners: Record<string, Array<(...args: Array<unknown>) => void>>;
  dispatch: (type: string) => void;
}

function mockSWContainer(opts: {
  controller: MockWorker | null;
  registration: MockRegistration | null;
  reject?: boolean;
}): MockSW {
  const listeners: Record<string, Array<(...args: Array<unknown>) => void>> = {};
  const container: MockSW = {
    controller: opts.controller,
    getRegistration: vi.fn(() =>
      opts.reject
        ? Promise.reject(new Error('no registration'))
        : Promise.resolve(opts.registration as unknown as ServiceWorkerRegistration),
    ),
    addEventListener: vi.fn((type: string, fn: (...args: Array<unknown>) => void) => {
      (listeners[type] ??= []).push(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: (...args: Array<unknown>) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    }),
    listeners,
    dispatch: (type: string) => {
      for (const fn of [...(listeners[type] ?? [])]) fn();
    },
  };
  return container;
}

const originalSWDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

function installSW(mock: MockSW | undefined): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: mock,
    configurable: true,
    writable: true,
  });
}

function restoreSW(): void {
  if (originalSWDescriptor) {
    Object.defineProperty(navigator, 'serviceWorker', originalSWDescriptor);
  } else {
    // jsdom normally has no serviceWorker; remove the test definition.
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  }
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('UpdatePrompt', () => {
  afterEach(restoreSW);

  it('FT1 shows prompt when registration.waiting exists AND a controller exists', async () => {
    const waiting = mockWorker();
    const controller = mockWorker();
    const reg = mockRegistration({ waiting });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    render(<UpdatePrompt onReload={vi.fn()} />);
    expect(await screen.findByText('New version available')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('FT2 shows nothing on first install (installing, no controller, no waiting)', async () => {
    const installing = mockWorker();
    installing.state = 'installing';
    const reg = mockRegistration({ installing });
    const sw = mockSWContainer({ controller: null, registration: reg });
    installSW(sw);
    render(<UpdatePrompt onReload={vi.fn()} />);
    await flush();
    expect(screen.queryByText('New version available')).toBeNull();
  });

  it('FT3 shows nothing with no serviceWorker support, and nothing when registration rejects', async () => {
    installSW(undefined);
    const { unmount } = render(<UpdatePrompt onReload={vi.fn()} />);
    await flush();
    expect(screen.queryByText('New version available')).toBeNull();
    unmount();

    const sw = mockSWContainer({ controller: mockWorker(), registration: null, reject: true });
    installSW(sw);
    render(<UpdatePrompt onReload={vi.fn()} />);
    await flush();
    expect(screen.queryByText('New version available')).toBeNull();
  });

  it('FT4 Update posts SKIP_WAITING and reloads exactly once on controllerchange', async () => {
    const waiting = mockWorker();
    const controller = mockWorker();
    const reg = mockRegistration({ waiting });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    const onReload = vi.fn();
    render(<UpdatePrompt onReload={onReload} />);
    const update = await screen.findByRole('button', { name: 'Update' });
    fireEvent.click(update);
    await flush();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect((update as HTMLButtonElement).disabled).toBe(true);
    act(() => sw.dispatch('controllerchange'));
    expect(onReload).toHaveBeenCalledTimes(1);
    act(() => sw.dispatch('controllerchange'));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('FT5 controllerchange without Update click does NOT reload; prompt converts to Reload variant', async () => {
    const waiting = mockWorker();
    const controller = mockWorker();
    const reg = mockRegistration({ waiting });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    const onReload = vi.fn();
    render(<UpdatePrompt onReload={onReload} />);
    await screen.findByRole('button', { name: 'Update' });
    act(() => sw.dispatch('controllerchange'));
    expect(onReload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });

  it('FT6 stale waiting: Update after activation posts nothing and converts to Reload, or hides if registration is gone', async () => {
    const waiting = mockWorker();
    const controller = mockWorker();
    const reg = mockRegistration({ waiting });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    render(<UpdatePrompt onReload={vi.fn()} />);
    await screen.findByRole('button', { name: 'Update' });
    // Another tab activated: re-fetch now returns no waiting, controller present.
    sw.getRegistration.mockImplementation(() =>
      Promise.resolve(
        mockRegistration({ waiting: null }) as unknown as ServiceWorkerRegistration,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await flush();
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    cleanup();

    // Registration gone entirely: Update hides the banner, never throws.
    const waiting2 = mockWorker();
    const reg2 = mockRegistration({ waiting: waiting2 });
    const sw2 = mockSWContainer({ controller: mockWorker(), registration: reg2 });
    installSW(sw2);
    render(<UpdatePrompt onReload={vi.fn()} />);
    await screen.findByRole('button', { name: 'Update' });
    sw2.getRegistration.mockImplementation(() => Promise.resolve(null));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await flush();
    expect(waiting2.postMessage).not.toHaveBeenCalled();
    expect(screen.queryByText('New version available')).toBeNull();
  });

  it('FT7 Dismiss hides; a NEW waiting object re-shows; the same object does not re-show', async () => {
    const waiting = mockWorker();
    const controller = mockWorker();
    const reg = mockRegistration({ waiting });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    render(
      <>
        <button key="before" type="button">
          Before
        </button>
        <UpdatePrompt key="prompt" onReload={vi.fn()} />
      </>,
    );
    const before = screen.getByRole('button', { name: 'Before' });
    before.focus();
    await screen.findByRole('button', { name: 'Update' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('New version available')).toBeNull();
    // Same waiting object on a load re-check: must NOT re-show.
    act(() => window.dispatchEvent(new Event('load')));
    await flush();
    expect(screen.queryByText('New version available')).toBeNull();
    // A new waiting object on a load re-check: must re-show.
    const waiting2 = mockWorker();
    sw.getRegistration.mockImplementation(() =>
      Promise.resolve(
        mockRegistration({ waiting: waiting2 }) as unknown as ServiceWorkerRegistration,
      ),
    );
    act(() => window.dispatchEvent(new Event('load')));
    await screen.findByRole('button', { name: 'Update' });
  });

  it('FT8 listeners are removed on unmount; re-mounting does not duplicate prompts', async () => {
    const waiting = mockWorker();
    const controller = mockWorker();
    const reg = mockRegistration({ waiting });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    const onReload = vi.fn();
    const { unmount } = render(<UpdatePrompt onReload={onReload} />);
    await screen.findByRole('button', { name: 'Update' });
    unmount();
    expect(sw.removeEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
    );
    act(() => sw.dispatch('controllerchange'));
    expect(onReload).not.toHaveBeenCalled();
    render(<UpdatePrompt onReload={onReload} />);
    const updates = await screen.findAllByRole('button', { name: 'Update' });
    expect(updates).toHaveLength(1);
  });

  it('FT9 Dismiss during updating disarms: a later controllerchange does not reload', async () => {
    const waiting = mockWorker();
    const controller = mockWorker();
    const reg = mockRegistration({ waiting });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    const onReload = vi.fn();
    render(<UpdatePrompt onReload={onReload} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Update' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('New version available')).toBeNull();
    act(() => sw.dispatch('controllerchange'));
    expect(onReload).not.toHaveBeenCalled();
  });

  it('FT10 banner message is aria-live polite, no focus move on appear, Dismiss restores focus', async () => {
    const waiting = mockWorker();
    const controller = mockWorker();
    const reg = mockRegistration({ waiting });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    render(
      <>
        <button key="before" type="button">
          Before
        </button>
        <div key="main" id="main-content" tabIndex={-1} />
        <UpdatePrompt key="prompt" onReload={vi.fn()} />
      </>,
    );
    const before = screen.getByRole('button', { name: 'Before' });
    before.focus();
    const message = await screen.findByText('New version available');
    expect(message.closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
    expect(document.activeElement).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(document.activeElement).toBe(before);
  });

  it('FT10b Dismiss falls back to #main-content when the pre-banner focus target is gone', async () => {
    const waiting = mockWorker();
    const controller = mockWorker();
    const reg = mockRegistration({ waiting });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    const { rerender } = render(
      <>
        <button key="before" type="button">
          Before
        </button>
        <div key="main" id="main-content" tabIndex={-1} />
        <UpdatePrompt key="prompt" onReload={vi.fn()} />
      </>,
    );
    const before = screen.getByRole('button', { name: 'Before' });
    before.focus();
    await screen.findByRole('button', { name: 'Update' });
    // Remove the focus target through React (keyed children keep the prompt
    // instance alive); Dismiss must then fall back to #main-content.
    rerender(
      <>
        <div key="main" id="main-content" tabIndex={-1} />
        <UpdatePrompt key="prompt" onReload={vi.fn()} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });

  it('shows prompt when a new worker installs after mount (updatefound + statechange)', async () => {
    const installing = mockWorker();
    installing.state = 'installing';
    const controller = mockWorker();
    const reg = mockRegistration({ installing });
    const sw = mockSWContainer({ controller, registration: reg });
    installSW(sw);
    render(<UpdatePrompt onReload={vi.fn()} />);
    await flush();
    expect(screen.queryByText('New version available')).toBeNull();
    // The worker finishes installing and becomes waiting.
    const waiting = mockWorker();
    reg.waiting = waiting;
    installing.state = 'installed';
    act(() => reg.dispatch('updatefound'));
    // updatefound handler listens on the installing worker's statechange.
    act(() => installing.dispatch('statechange'));
    await screen.findByRole('button', { name: 'Update' });
  });
});
