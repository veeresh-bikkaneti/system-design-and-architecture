import { afterEach, describe, expect, it, vi } from 'vitest';
import { openOAuthPopup } from './oauthPopup';

interface FakePopup {
  closed: boolean;
  close: () => void;
}

interface FakeWindow {
  open: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  setTimeout: ReturnType<typeof vi.fn>;
  clearTimeout: ReturnType<typeof vi.fn>;
}

let fakeWindow: FakeWindow;
let popup: FakePopup;
let messageListener: ((e: { origin: string; source: unknown; data: unknown }) => void) | null;

function installFakeWindow(): void {
  popup = { closed: false, close: vi.fn(() => { popup.closed = true; }) };
  messageListener = null;
  fakeWindow = {
    open: vi.fn(() => popup),
    addEventListener: vi.fn((_type: string, fn: typeof messageListener) => {
      messageListener = fn;
    }),
    removeEventListener: vi.fn(() => {
      messageListener = null;
    }),
    setTimeout: vi.fn((_fn: () => void, _ms: number) => 1),
    clearTimeout: vi.fn(),
  };
  (globalThis as { window?: unknown }).window = fakeWindow;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

const ORIGIN = 'https://qa-worker.example.workers.dev';

function postFromPopup(data: unknown, origin = ORIGIN, source: unknown = popup): void {
  messageListener?.({ origin, source, data });
}

describe('openOAuthPopup', () => {
  it('resolves ok on a valid popup message and closes the popup', async () => {
    installFakeWindow();
    const pending = openOAuthPopup(`${ORIGIN}/api/qa/auth/github`, ORIGIN, 1000);
    expect(fakeWindow.open).toHaveBeenCalledWith(
      `${ORIGIN}/api/qa/auth/github`,
      'veer-github-signin',
      expect.any(String),
    );
    postFromPopup({ type: 'qa-auth', ok: true });
    await expect(pending).resolves.toBe('ok');
    expect(popup.close).toHaveBeenCalled();
    expect(fakeWindow.removeEventListener).toHaveBeenCalled();
  });

  it('ignores messages from the wrong origin', async () => {
    installFakeWindow();
    const pending = openOAuthPopup(`${ORIGIN}/api/qa/auth/github`, ORIGIN, 50);
    postFromPopup({ type: 'qa-auth', ok: true }, 'https://evil.example');
    // The wrong-origin message must not settle the promise; the timeout does.
    const timerFn = fakeWindow.setTimeout.mock.calls[0]?.[0] as () => void;
    timerFn();
    await expect(pending).resolves.toBe('dismissed');
  });

  it('ignores messages from another source window', async () => {
    installFakeWindow();
    const pending = openOAuthPopup(`${ORIGIN}/api/qa/auth/github`, ORIGIN, 50);
    postFromPopup({ type: 'qa-auth', ok: true }, ORIGIN, { not: 'the popup' });
    const timerFn = fakeWindow.setTimeout.mock.calls[0]?.[0] as () => void;
    timerFn();
    await expect(pending).resolves.toBe('dismissed');
  });

  it('ignores malformed payloads but accepts a later valid one', async () => {
    installFakeWindow();
    const pending = openOAuthPopup(`${ORIGIN}/api/qa/auth/github`, ORIGIN, 1000);
    postFromPopup({ type: 'something-else' });
    postFromPopup(null);
    postFromPopup({ type: 'qa-auth', ok: true });
    await expect(pending).resolves.toBe('ok');
  });

  it('treats ok:false as dismissed', async () => {
    installFakeWindow();
    const pending = openOAuthPopup(`${ORIGIN}/api/qa/auth/github`, ORIGIN, 1000);
    postFromPopup({ type: 'qa-auth', ok: false, error: 'access_denied' });
    await expect(pending).resolves.toBe('dismissed');
  });

  it('resolves blocked when the popup is blocked', async () => {
    installFakeWindow();
    fakeWindow.open.mockReturnValue(null);
    await expect(openOAuthPopup(`${ORIGIN}/api/qa/auth/github`, ORIGIN, 1000)).resolves.toBe(
      'blocked',
    );
    expect(fakeWindow.addEventListener).not.toHaveBeenCalled();
  });
});
