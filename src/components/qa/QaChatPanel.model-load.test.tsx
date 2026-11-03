// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * M1 / QA R-02 + R-04 phase 1: FAILING panel tests. The model is "still
 * loading" forever: rewriteWithModel / answerParametrically never settle, which
 * is exactly what a hung WebLLM create() does to the panel today.
 * Ben's keyword routing is REAL (same approach as QaChatPanel.veer.test.tsx).
 * Real WebGPU / Prompt API behaviour is NOT exercised (UNVERIFIED in CI).
 */

const model = vi.hoisted(() => ({
  status: { phase: 'loading', progress: 4, detail: 'Fetching param cache' },
  cancel: undefined as unknown,
}));
const cancelModelLoad = vi.hoisted(() => vi.fn());

vi.mock('../../ai/local/inference', () => ({
  MODEL_LABEL: 'On-device AI',
  getModelStatus: () => model.status,
  subscribeModel: (listener: (next: unknown) => void) => {
    listener(model.status);
    return () => {};
  },
  cancelModelLoad,
  // A hung load: neither settles, like a create() that never returns.
  rewriteWithModel: () => new Promise(() => {}),
  answerParametrically: () => new Promise(() => {}),
}));

vi.mock('../../ai/local/semantic/embedder', () => ({
  loadSemantic: async () => {},
  semanticWithin: async () => null, // keyword path, as after SEMANTIC_WAIT_MS
  subscribeSemantic: () => () => {},
}));

type PanelComponent = ComponentType<{ open: boolean; onClose: () => void }>;

async function loadPanel(): Promise<PanelComponent> {
  const mod = await import('./QaChatPanel');
  return mod.QaChatPanel as PanelComponent;
}

const panel = (Panel: PanelComponent, open = true) =>
  createElement(MemoryRouter, null, createElement(Panel, { open, onClose: () => {} }));

async function ask(question: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Ask about the course'), question);
  await user.click(screen.getByRole('button', { name: 'Send message' }));
}

const composer = () => screen.getByLabelText('Ask about the course') as HTMLTextAreaElement;

beforeEach(() => {
  localStorage.clear();
  cancelModelLoad.mockReset();
  model.status = { phase: 'loading', progress: 4, detail: 'Fetching param cache' };
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no fetch expected'); }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('M1b the composer is never disabled by model loading alone', () => {
  it('a lesson answer lands while the model loads (it does today) and the composer must come back (it does not)', async () => {
    const Panel = await loadPanel();
    render(panel(Panel));
    await ask('What is the CAP theorem?');
    await waitFor(() => expect(screen.getAllByText(/CAP/).length).toBeGreaterThan(0));
    // The grounded lesson answer is on screen; only the wording step waits on the model.
    expect(composer().disabled).toBe(false);
    expect(screen.queryByText('The assistant is writing…')).toBeNull();
  });

  it('a question only the model could answer does not leave a blank bubble and a dead composer', async () => {
    const Panel = await loadPanel();
    render(panel(Panel));
    await ask('what is amazon');
    await waitFor(() => expect(composer().disabled).toBe(false));
    expect(screen.getByRole('button', { name: /New topic/ }).hasAttribute('disabled')).toBe(false);
  });

  it('close and reopen does not resurrect a blocked composer', async () => {
    const Panel = await loadPanel();
    const view = render(panel(Panel));
    await ask('What is the CAP theorem?');
    view.rerender(panel(Panel, false));
    view.rerender(panel(Panel, true));
    await waitFor(() => expect(composer().disabled).toBe(false));
  });
});

describe('M1b R-04: answers given without the model are labelled provisional', () => {
  it('a keyword-path lesson answer says it is provisional, not just "keyword match"', async () => {
    const Panel = await loadPanel();
    render(panel(Panel));
    await ask('What is the CAP theorem?');
    await waitFor(() => expect(screen.getAllByText(/CAP/).length).toBeGreaterThan(0));
    expect(screen.getByText(/provisional/i)).toBeTruthy();
  });
});

describe('M1b cancel affordance', () => {
  it('shows a Stop button while loading and calls cancelModelLoad()', async () => {
    const Panel = await loadPanel();
    render(panel(Panel));
    await userEvent.setup().click(screen.getByRole('button', { name: /stop loading/i }));
    expect(cancelModelLoad).toHaveBeenCalledTimes(1);
  });

  it('says so when the load was cancelled, and offers no Stop button', async () => {
    model.status = { phase: 'cancelled', progress: 0, detail: 'On-device model stopped' };
    const Panel = await loadPanel();
    render(panel(Panel));
    expect(screen.getByText(/stopped|cancelled/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /stop loading/i })).toBeNull();
  });
});
