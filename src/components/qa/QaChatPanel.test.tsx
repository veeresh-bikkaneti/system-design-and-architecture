// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QaChatPanel } from './QaChatPanel';

/**
 * Controllable stand-ins for the two status sources the panel subscribes
 * to. The real modules are heavy (on-device model, embedding pipeline),
 * so the header tests drive phases through these mocks instead of through
 * a real model load. The mock subscribe functions mirror the real ones:
 * they invoke the listener immediately with the current status.
 */
const mockState = vi.hoisted(() => ({
  modelStatus: { phase: 'idle', progress: 0, detail: 'Not loaded' },
  semanticPhase: 'idle',
}));

vi.mock('../../ai/local/inference', () => ({
  MODEL_LABEL: 'On-device AI',
  getModelStatus: () => mockState.modelStatus,
  subscribeModel: (listener: (next: unknown) => void) => {
    listener(mockState.modelStatus);
    return () => {};
  },
  answerParametrically: vi.fn(),
  rewriteWithModel: vi.fn(),
}));

vi.mock('../../ai/local/semantic/embedder', () => ({
  loadSemantic: () => Promise.resolve(null),
  semanticWithin: vi.fn(),
  subscribeSemantic: (listener: (next: unknown) => void) => {
    listener(mockState.semanticPhase);
    return () => {};
  },
}));

const GENERIC_LINE = 'Runs in your browser · no API key';
const FAILED_LINE = 'Model failed · lesson answers work';

function renderPanel(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <QaChatPanel open onClose={() => {}} />
    </MemoryRouter>,
  );
}

function setPhases(model: typeof mockState.modelStatus, semantic: string): void {
  mockState.modelStatus = model;
  mockState.semanticPhase = semantic;
}

beforeEach(() => {
  window.localStorage.clear();
  setPhases({ phase: 'idle', progress: 0, detail: 'Not loaded' }, 'idle');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('QaChatPanel header status line', () => {
  it('BF1: model failed shows the failed line, not the generic line', () => {
    setPhases({ phase: 'failed', progress: 0, detail: 'boom' }, 'idle');
    renderPanel();
    expect(screen.getByText(FAILED_LINE)).toBeTruthy();
    expect(screen.queryByText(GENERIC_LINE)).toBeNull();
  });

  it('BF2: model ready shows modelStatus.detail exactly', () => {
    setPhases({ phase: 'ready', progress: 100, detail: 'Built-in browser AI' }, 'ready');
    renderPanel();
    expect(screen.getByText('Built-in browser AI')).toBeTruthy();
    expect(screen.queryByText(FAILED_LINE)).toBeNull();
  });

  it('BF3: semantic loading takes precedence over a model loading line', () => {
    setPhases({ phase: 'loading', progress: 42, detail: 'Starting' }, 'loading');
    renderPanel();
    expect(screen.getByText('Getting ready · reading the lessons')).toBeTruthy();
    expect(screen.queryByText('Loading On-device AI · 42%')).toBeNull();
  });

  it('BF4: model loading shows the model loading line when semantic is not loading', () => {
    setPhases({ phase: 'loading', progress: 42, detail: 'Starting' }, 'idle');
    renderPanel();
    expect(screen.getByText('Loading On-device AI · 42%')).toBeTruthy();
  });

  it('BF5: semantic failed alone with model ready shows the ready detail, not the failed line', () => {
    setPhases({ phase: 'ready', progress: 100, detail: 'Built-in browser AI' }, 'failed');
    renderPanel();
    expect(screen.getByText('Built-in browser AI')).toBeTruthy();
    expect(screen.queryByText(FAILED_LINE)).toBeNull();
  });
});
