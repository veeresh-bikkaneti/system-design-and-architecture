// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Branch 1 / F1: a post-ready `semantic.embed()` that times out (the
 * embedder rejects it at its 12 s bound — see embedder.readiness.test.ts)
 * must not dead-end the turn. The panel falls back to the keyword pipeline
 * for that turn instead of showing the source-check error line.
 * Real WebGPU / embedding behaviour is NOT exercised (UNVERIFIED in CI).
 */

vi.mock('../../ai/local/inference', () => ({
  MODEL_LABEL: 'On-device AI',
  getModelStatus: () => ({ phase: 'ready', progress: 100, detail: 'Built-in browser AI' }),
  subscribeModel: (listener: (next: unknown) => void) => {
    listener({ phase: 'ready', progress: 100, detail: 'Built-in browser AI' });
    return () => {};
  },
  cancelModelLoad: vi.fn(),
  retryModelLoad: vi.fn(),
  rewriteWithModel: async () => null,
  answerParametrically: async () => null,
}));

const timedOutSemantic = {
  index: { content: 'test', dims: 1, chunks: [], examples: [] },
  // What embedder.ts produces after the fix when the extractor stalls:
  // a rejection at the embed bound, never a hang.
  embed: async () => {
    throw new Error('Embedding timed out.');
  },
};

vi.mock('../../ai/local/semantic/embedder', () => ({
  loadSemantic: async () => timedOutSemantic,
  semanticWithin: async () => timedOutSemantic,
  subscribeSemantic: (listener: (next: string) => void) => {
    listener('ready');
    return () => {};
  },
}));

type PanelComponent = ComponentType<{ open: boolean; onClose: () => void }>;

async function loadPanel(): Promise<PanelComponent> {
  const mod = await import('./QaChatPanel');
  return mod.QaChatPanel as PanelComponent;
}

async function ask(question: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Ask about the course'), question);
  await user.click(screen.getByRole('button', { name: 'Send message' }));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no fetch expected'); }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('QaChatPanel embed-timeout fallback (Branch 1)', () => {
  it('a timed-out embed() answers from the keyword pipeline, not the error line', async () => {
    const Panel = await loadPanel();
    render(createElement(MemoryRouter, null, createElement(Panel, { open: true, onClose: () => {} })));
    await ask('What is the CAP theorem?');
    await waitFor(() => expect(screen.getAllByText(/CAP/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/could not reach a source/i)).toBeNull();
    expect((screen.getByLabelText('Ask about the course') as HTMLTextAreaElement).disabled).toBe(false);
  });
});
