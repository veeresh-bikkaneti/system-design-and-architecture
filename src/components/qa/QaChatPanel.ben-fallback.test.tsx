// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const FAILED_COPY = 'On-device model unavailable · answering from the lessons';

vi.mock('../../ai/local/inference', () => ({
  MODEL_LABEL: 'On-device AI',
  getModelStatus: () => ({ phase: 'failed', progress: 0, detail: FAILED_COPY }),
  subscribeModel: (listener: (next: { phase: string; progress: number; detail: string }) => void) => {
    listener({ phase: 'failed', progress: 0, detail: FAILED_COPY });
    return () => {};
  },
  rewriteWithModel: async () => null,
  answerParametrically: async () => null,
}));

vi.mock('../../ai/local/semantic/embedder', () => ({
  loadSemantic: async () => ({
    index: { content: 'test', dims: 1, chunks: [], examples: [] },
    embed: async () => new Float32Array([1]),
  }),
  semanticWithin: async () => ({
    index: { content: 'test', dims: 1, chunks: [], examples: [] },
    embed: async () => new Float32Array([1]),
  }),
  subscribeSemantic: (listener: (next: string) => void) => {
    listener('ready');
    return () => {};
  },
}));

vi.mock('../../ai/local/semantic/router', () => ({
  THRESHOLDS: {
    k: 7,
    lesson: 0.45,
    clarify: 0.33,
    depth: 0.25,
    ruleVeto: 0.7,
    override: 0.62,
    overrideVote: 0.6,
    nameBoost: 0.08,
    nameBoostMaxTokens: 3,
    draftFit: 0.45,
  },
  queryText: (question: string) => question,
  route: () => ({
    action: 'parametric_fallback',
    intent: 'tech',
    intentConfidence: 1,
    intentScores: { course: 0, tech: 1, debate: 0, off_topic: 0, self: 0 },
    lessons: [],
    reasons: ['test: force parametric'],
  }),
}));

type PanelComponent = ComponentType<{ open: boolean; onClose: () => void }>;

async function loadPanel(): Promise<PanelComponent> {
  const mod = await import('./QaChatPanel');
  return mod.QaChatPanel as PanelComponent;
}

function renderPanel(Panel: PanelComponent) {
  return render(createElement(MemoryRouter, null, createElement(Panel, { open: true, onClose: () => {} })));
}

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
  const box = screen.getByLabelText('Ask about the course');
  await user.clear(box);
  await user.type(box, question);
  await user.click(screen.getByRole('button', { name: 'Send message' }));
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

describe('QaChatPanel Ben wording-engine fallback', () => {
  it('shows the failed on-device model in the subtitle', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('no fetch expected');
    }));
    const Panel = await loadPanel();
    renderPanel(Panel);
    expect(screen.getByText(FAILED_COPY)).toBeTruthy();
  });

  it('answers an in-scope parametric question from the lessons when Qwen is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('no fetch expected');
    }));
    const Panel = await loadPanel();
    renderPanel(Panel);
    await ask(userEvent.setup(), 'tell me about ai harness');
    await waitFor(() => {
      expect(screen.getByText(/An agent is a loop/i)).toBeTruthy();
    });
    expect(screen.queryByText(/I could not find a source/i)).toBeNull();
  });

  it('keeps the honest empty line when no lesson matches and Qwen is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('no fetch expected');
    }));
    const Panel = await loadPanel();
    renderPanel(Panel);
    await ask(userEvent.setup(), 'what is amazon');
    await waitFor(() => {
      expect(screen.getByText(/I could not find a source for that, so I will not guess/i)).toBeTruthy();
    });
  });
});
