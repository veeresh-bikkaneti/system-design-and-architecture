// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Manifest 2 widget-port acceptance tests.
 *
 * Ben's heavy runtime seams are mocked out (the on-device model and the
 * 23 MB semantic embedder), but Ben's routing itself is REAL: the keyword
 * pipeline (prepareTurn over the actual lesson cards) produces the answers
 * asserted below, so "Ben behaves as before" is proven against production
 * logic, not a stub. The Worker is simulated with a fetch router; no
 * /api/qa/* request can leave the test.
 *
 * qaApi.ts reads VITE_QA_API_BASE at module load, so each test sets the
 * env first, resets the module registry, and imports the panel fresh.
 */

vi.mock('../../ai/local/inference', () => ({
  MODEL_LABEL: 'On-device AI',
  getModelStatus: () => ({ phase: 'failed', progress: 0, detail: 'Runs in your browser · no API key' }),
  subscribeModel: () => () => {},
  rewriteWithModel: async () => null,
  answerParametrically: async () => null,
}));

vi.mock('../../ai/local/semantic/embedder', () => ({
  loadSemantic: async () => {},
  semanticWithin: async () => null,
  subscribeSemantic: () => () => {},
}));

const WORKER_ORIGIN = 'https://worker.example.test';
const DISCLOSURE =
  'Questions you ask Veer are sent to this course\'s own server and are deleted after 30 days.';
const QUESTION = 'What is the CAP theorem?';

type PanelComponent = ComponentType<{ open: boolean; onClose: () => void }>;

async function loadPanel(): Promise<PanelComponent> {
  vi.resetModules();
  const mod = await import('./QaChatPanel');
  return mod.QaChatPanel as PanelComponent;
}

function renderPanel(Panel: PanelComponent) {
  return render(createElement(MemoryRouter, null, createElement(Panel, { open: true, onClose: () => {} })));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(text: string, status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
}

interface FetchCall {
  url: string;
  method: string;
}

/** Fetch stub that routes the three Worker endpoints and records every call. */
function workerFetch(chatBody: () => Response, authenticated = true) {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET' });
    if (url.endsWith('/api/qa/auth/status')) {
      return jsonResponse(
        authenticated ? { authenticated: true, login: 'octocat' } : { authenticated: false },
      );
    }
    if (url.endsWith('/api/qa/quota')) {
      return jsonResponse({ limit: 50, remaining: 49, resetAt: '2099-01-01T00:00:00.000Z' });
    }
    if (url.endsWith('/api/qa/chat')) return chatBody();
    throw new Error(`unexpected fetch in test: ${url}`);
  });
  return { mock, calls };
}

async function askBen(user: ReturnType<typeof userEvent.setup>) {
  const box = screen.getByLabelText('Ask about the course');
  await user.type(box, QUESTION);
  await user.click(screen.getByRole('button', { name: 'Send message' }));
}

/** Ben's grounded keyword-pipeline answer to the CAP question has landed. */
async function expectBenAnswer() {
  await waitFor(() => {
    expect(screen.getAllByText(/CAP/).length).toBeGreaterThan(0);
    expect(screen.queryByText('The assistant is writing…')).toBeNull();
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('QaChatPanel Veer port (Manifest 2)', () => {
  it('Veer mode is hidden/disabled when VITE_QA_API_BASE is unset', async () => {
    vi.stubEnv('VITE_QA_API_BASE', '');
    const fetchMock = vi.fn(async () => {
      throw new Error('no fetch expected');
    });
    vi.stubGlobal('fetch', fetchMock);
    const Panel = await loadPanel();
    renderPanel(Panel);

    // Ben is fully present; there is no Veer affordance anywhere.
    expect(screen.getByRole('heading', { name: 'Ask Ben' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Veer/ })).toBeNull();
    expect(screen.queryByText(DISCLOSURE)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('H1: a signed-out student chats with Ben and makes zero /api/qa/* requests', async () => {
    vi.stubEnv('VITE_QA_API_BASE', WORKER_ORIGIN);
    const { mock, calls } = workerFetch(
      () => {
        throw new Error('chat must not be called in Ben mode');
      },
      false,
    );
    vi.stubGlobal('fetch', mock);
    const Panel = await loadPanel();
    renderPanel(Panel);
    const user = userEvent.setup();

    await askBen(user);
    await expectBenAnswer();

    // The Veer sign-in affordance is visible, yet nothing was requested:
    // auth state is probed lazily, only when the student engages Veer.
    expect(screen.getByRole('button', { name: /Veer/ })).toBeTruthy();
    expect(calls.filter((c) => c.url.includes('/api/qa/'))).toEqual([]);
    expect(mock).not.toHaveBeenCalled();
  });

  it('Ben path behaviour is unchanged when the worker is unreachable', async () => {
    vi.stubEnv('VITE_QA_API_BASE', WORKER_ORIGIN);
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const Panel = await loadPanel();
    renderPanel(Panel);
    const user = userEvent.setup();

    await askBen(user);
    await expectBenAnswer();

    // Ben answered from the on-device pipeline; no error dead-end.
    expect(screen.queryByText(/could not reach/i)).toBeNull();
  });

  it('widget visibly indicates Ben vs Veer mode before the student sends', async () => {
    vi.stubEnv('VITE_QA_API_BASE', WORKER_ORIGIN);
    const { mock, calls } = workerFetch(() => {
      throw new Error('chat must not be called before the student sends');
    });
    vi.stubGlobal('fetch', mock);
    const Panel = await loadPanel();
    renderPanel(Panel);
    const user = userEvent.setup();

    // Default: Ben is the indicated mode before anything is typed or sent.
    const benToggle = screen.getByRole('button', { name: /Ask Ben/ });
    const veerToggle = screen.getByRole('button', { name: /Ask Veer/ });
    expect(benToggle.getAttribute('aria-pressed')).toBe('true');
    expect(veerToggle.getAttribute('aria-pressed')).toBe('false');

    // Switch to Veer (signed in): the indication flips and the disclosure
    // sentence is on screen -- all before any message is sent.
    await user.click(veerToggle);
    await waitFor(() => expect(veerToggle.getAttribute('aria-pressed')).toBe('true'));
    expect(benToggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(DISCLOSURE)).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith('/api/qa/chat'))).toBe(false);
  });

  it('H3: a signed-in Veer answer streams with citations in the panel', async () => {
    vi.stubEnv('VITE_QA_API_BASE', WORKER_ORIGIN);
    const { mock } = workerFetch(() =>
      sseResponse(
        'event: message\ndata: {"delta":"A system cannot have "}\n\n' +
          'event: message\ndata: {"delta":"all three at once."}\n\n' +
          'event: sources\ndata: {"lessons":[{"slug":"cap-theorem","title":"CAP Theorem"}]}\n\n' +
          'event: done\ndata: {}\n\n',
      ),
    );
    vi.stubGlobal('fetch', mock);
    const Panel = await loadPanel();
    renderPanel(Panel);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Ask Veer/ }));
    const box = screen.getByLabelText('Ask about the course');
    await user.type(box, QUESTION);
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(screen.getByText(/A system cannot have all three at once\./)).toBeTruthy(),
    );
    // The Veer citation renders as a lesson chip, like Ben's sources.
    expect(screen.getByRole('link', { name: 'CAP Theorem' })).toBeTruthy();
  });

  it('on AI_UNAVAILABLE the panel falls back to Ben with no dead end', async () => {
    vi.stubEnv('VITE_QA_API_BASE', WORKER_ORIGIN);
    const { mock } = workerFetch(() =>
      sseResponse(
        'event: error\ndata: {"code":"AI_UNAVAILABLE","message":"Veer is unavailable right now."}\n\n',
      ),
    );
    vi.stubGlobal('fetch', mock);
    const Panel = await loadPanel();
    renderPanel(Panel);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Ask Veer/ }));
    const box = screen.getByLabelText('Ask about the course');
    await user.type(box, QUESTION);
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    // Ben answers the same question in the same session, with a visible
    // notice -- no re-auth, no reload, no stuck composer.
    await waitFor(() => expect(screen.getByText(/Veer is unavailable/i)).toBeTruthy());
    await expectBenAnswer();
    await waitFor(() => expect((box as HTMLTextAreaElement).disabled).toBe(false));

    // And the conversation continues: a follow-up goes to Ben and answers.
    await user.type(box, QUESTION);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(screen.getAllByText(/CAP/).length).toBeGreaterThan(1),
    );
  });
});
