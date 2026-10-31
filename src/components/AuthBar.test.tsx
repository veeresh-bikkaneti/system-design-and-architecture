// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextUnfinishedSlug } from '../lib/continue';
import { useProgressStore } from '../store/progress';
import { useSessionStore } from '../store/session';
import { AuthBar, OauthCallbackPage } from './AuthBar';

vi.mock('../lib/gist-sync', () => ({
  findOrCreateGist: vi.fn(),
  pullAndMerge: vi.fn(),
  syncNow: vi.fn(),
}));
vi.mock('../lib/idle', () => ({
  startIdleWatch: vi.fn(() => () => {}),
}));

import { findOrCreateGist, pullAndMerge, syncNow } from '../lib/gist-sync';

const mockSyncNow = vi.mocked(syncNow);
const mockFindOrCreateGist = vi.mocked(findOrCreateGist);
const mockPullAndMerge = vi.mocked(pullAndMerge);

const PAT_NETWORK = 'Could not reach GitHub. Check your connection and try again.';
const OAUTH_NETWORK = 'Could not reach GitHub to finish signing in. Check your connection and try again.';

function resetSession() {
  sessionStorage.removeItem('sdm-gh-token');
  useSessionStore.setState({
    githubLogin: null,
    gistId: null,
    accessToken: null,
    lastSyncedAt: null,
    progressRev: 0,
    pausedAt: null,
    dirty: false,
    loginPrompt: false,
  });
}

function signInSession(overrides: Partial<Parameters<typeof useSessionStore.setState>[0]> = {}) {
  useSessionStore.setState({
    githubLogin: 'octo',
    gistId: 'gist-1',
    accessToken: 'tok',
    lastSyncedAt: null,
    progressRev: 0,
    pausedAt: null,
    dirty: false,
    loginPrompt: false,
    ...overrides,
  });
}

function renderAuthBar() {
  const router = createMemoryRouter([{ path: '*', element: <AuthBar /> }], {
    initialEntries: ['/'],
  });
  render(<RouterProvider router={router} />);
  return router;
}

function renderCallback() {
  const router = createMemoryRouter([{ path: '*', element: <OauthCallbackPage /> }], {
    initialEntries: ['/oauth/callback'],
  });
  render(<RouterProvider router={router} />);
  return router;
}

function overlayContinueButton() {
  const buttons = screen.getAllByRole('button', { name: 'Continue' });
  const overlay = buttons.find((b) => b.closest('.fixed'));
  expect(overlay).toBeDefined();
  return overlay!;
}

beforeEach(() => {
  resetSession();
  useProgressStore.setState({
    completedLessons: [],
    quizResults: {},
    seenBadges: [],
    celebratedBadges: [],
  });
  window.history.pushState({}, '', '/');
  vi.clearAllMocks();
  mockSyncNow.mockResolvedValue(undefined);
  mockFindOrCreateGist.mockResolvedValue('gist-1');
  mockPullAndMerge.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('T-PWA-4b sync UI', () => {
  it('continue-rejecting-sync-still-navigates', async () => {
    signInSession({ pausedAt: Date.now() });
    mockSyncNow.mockRejectedValue(new Error('Failed to fetch'));
    const router = renderAuthBar();
    fireEvent.click(overlayContinueButton());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/lesson/${nextUnfinishedSlug([])}`),
    );
    expect(useSessionStore.getState().loginPrompt).toBe(false);
  });

  it('continue-401-opens-login', async () => {
    signInSession({ pausedAt: Date.now() });
    mockSyncNow.mockImplementation(async () => {
      // Faithful to gist-sync's 401 contract: pause + null the token, then throw.
      useSessionStore.getState().pause();
      useSessionStore.setState({ accessToken: null });
      throw new Error('github 401');
    });
    const router = renderAuthBar();
    fireEvent.click(overlayContinueButton());
    await waitFor(() => expect(useSessionStore.getState().loginPrompt).toBe(true));
    expect(router.state.location.pathname).toBe('/');
  });

  it('pat-network-copy-first-and-later', async () => {
    vi.stubEnv('VITE_GITHUB_CLIENT_ID', '');
    // (a) first-fetch network failure -> plain PAT copy, not raw.
    useSessionStore.setState({ loginPrompt: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderAuthBar();
    fireEvent.change(screen.getByLabelText(/GitHub token/i), { target: { value: 'tok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and sync' }));
    expect(await screen.findByText(PAT_NETWORK)).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(useSessionStore.getState().githubLogin).toBeNull();
    cleanup();

    // (b) later-stage network failure (user OK, gist-list rejects) -> same
    // plain copy, token retained, dialog stays.
    useSessionStore.setState({ loginPrompt: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ login: 'octo' }) }),
    );
    mockFindOrCreateGist.mockRejectedValue(new TypeError('Failed to fetch'));
    renderAuthBar();
    fireEvent.change(screen.getByLabelText(/GitHub token/i), { target: { value: 'tok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and sync' }));
    expect(await screen.findByText(PAT_NETWORK)).toBeTruthy();
    expect(useSessionStore.getState().isSignedIn()).toBe(true);
    expect(useSessionStore.getState().loginPrompt).toBe(true);
  });

  it('oauth-network-copy-and-post-exchange-silent', async () => {
    vi.stubEnv('VITE_WORKER_URL', 'https://worker.example.test');
    // (a) exchange network failure -> plain OAuth copy, not raw.
    window.history.pushState({}, '', '/oauth/callback?code=abc');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderCallback();
    expect(await screen.findByText(OAUTH_NETWORK)).toBeTruthy();
    expect(screen.queryByText('OAuth failed.')).toBeNull();
    cleanup();
    window.history.pushState({}, '', '/oauth/callback?code=abc');

    // (b) post-exchange non-auth sync failure -> silent completion.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: 'tok', login: 'octo' }),
      }),
    );
    mockSyncNow.mockRejectedValue(new Error('Failed to fetch'));
    const router = renderCallback();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(useSessionStore.getState().isSignedIn()).toBe(true);
    expect(useSessionStore.getState().dirty).toBe(true);
    expect(screen.queryByText(/OAuth failed|Could not reach/)).toBeNull();
  });

  it('dirty-after-success-label', () => {
    signInSession({ lastSyncedAt: Date.now() - 1000, dirty: true });
    renderAuthBar();
    expect(screen.queryByText('Synced')).toBeNull();
    expect(screen.getByText('octo')).toBeTruthy();
  });
});

describe('signed-in offline-label e2e T5 (fills the 4b positive-Paused gap)', () => {
  it('paused-label-reads-paused-when-paused', () => {
    signInSession({ pausedAt: Date.now(), lastSyncedAt: Date.now() - 1000, dirty: false });
    renderAuthBar();
    expect(screen.getByText('Paused')).toBeTruthy();
  });
});

describe('T-PWA-4b guards (must stay green)', () => {
  it('pat real rejection keeps rejection copy', async () => {
    vi.stubEnv('VITE_GITHUB_CLIENT_ID', '');
    useSessionStore.setState({ loginPrompt: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderAuthBar();
    fireEvent.change(screen.getByLabelText(/GitHub token/i), { target: { value: 'tok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and sync' }));
    expect(await screen.findByText('GitHub rejected that token.')).toBeTruthy();
  });

  it('oauth real exchange failure keeps exchange-failure copy', async () => {
    vi.stubEnv('VITE_WORKER_URL', 'https://worker.example.test');
    window.history.pushState({}, '', '/oauth/callback?code=abc');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderCallback();
    expect(await screen.findByText('OAuth exchange failed.')).toBeTruthy();
  });

  it('signed-out rendering unchanged', () => {
    renderAuthBar();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy();
    expect(screen.queryByText('Synced')).toBeNull();
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('synced label when clean', () => {
    signInSession({ lastSyncedAt: Date.now() - 1000, dirty: false });
    renderAuthBar();
    expect(screen.getByText('Synced')).toBeTruthy();
  });
});
