// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M1 / QA R-02 phase 1: FAILING acceptance tests for the model-load readiness
 * contract (see docs/manifests/m1-ben-model-load.md). Nothing here changes
 * behaviour; the fix lands in M1a.
 *
 * The WebLLM engine is stubbed, so these pin the state machine and the bounded
 * wait, NOT real WebGPU / Prompt API behaviour (UNVERIFIED in CI).
 *
 * Proposed contract (names are proposals, the Skeptic may rename):
 *   - no-progress bound  : a load with no download progress for 60 s fails.
 *   - slow progress      : any progress event re-arms the bound; no total cap.
 *   - cancelModelLoad()  : phase 'cancelled', pending callers resolve null.
 *   - getLoadTiming()    : { startedAt, firstProgressAt, readyAt, errorCount }.
 */

const createEngine = vi.fn();

vi.mock('@mlc-ai/web-llm', () => ({
  prebuiltAppConfig: { model_list: [{ model_id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' }] },
  CreateMLCEngine: (...args: unknown[]) => createEngine(...args),
}));

const NO_PROGRESS_BOUND_MS = 60_000;

type Progress = (report: { progress: number; text: string }) => void;
let reportProgress: Progress = () => {};
let resolveEngine: (engine: unknown) => void = () => {};

/** create() that stays pending until the test settles it, like a stalled download. */
function hangingEngine() {
  createEngine.mockImplementation(
    (_id: string, options: { initProgressCallback: Progress }) =>
      new Promise((resolve) => {
        reportProgress = options.initProgressCallback;
        resolveEngine = resolve;
      }),
  );
}

const readyEngine = {
  chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }] }) } },
};

const load = async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return import('./inference.ts');
};

/** Resolves to 'settled' or 'pending' without waiting on a promise that may never settle. */
async function state(p: Promise<unknown>): Promise<'settled' | 'pending'> {
  let settled = false;
  void p.then(
    () => (settled = true),
    () => (settled = true),
  );
  await vi.advanceTimersByTimeAsync(0);
  return settled ? 'settled' : 'pending';
}

beforeEach(() => {
  vi.useFakeTimers();
  createEngine.mockReset();
  vi.resetModules();
  vi.stubGlobal('LanguageModel', undefined);
  vi.stubGlobal('navigator', { gpu: { requestAdapter: () => Promise.resolve({}) } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('M1a bounded wait: no progress versus slow progress', () => {
  it('a create() that never settles and never reports progress fails within the bound', async () => {
    hangingEngine();
    const { answerParametrically, getModelStatus } = await load();
    const answer = answerParametrically('what is amazon', '');
    await vi.advanceTimersByTimeAsync(NO_PROGRESS_BOUND_MS);
    expect(await state(answer)).toBe('settled');
    expect(await answer).toBeNull();
    expect(getModelStatus().phase).toBe('failed');
  });

  it('slow but steady progress is NOT failed (guard: passes today and must keep passing)', async () => {
    hangingEngine();
    const { answerParametrically, getModelStatus } = await load();
    const answer = answerParametrically('what is amazon', '');
    await vi.advanceTimersByTimeAsync(0);
    // 20 s between events for 6 minutes: 3-6 %/min is what QA saw live.
    for (let i = 1; i <= 18; i++) {
      await vi.advanceTimersByTimeAsync(20_000);
      reportProgress({ progress: i / 100, text: 'Fetching param cache' });
    }
    expect(getModelStatus().phase).toBe('loading');
    expect(await state(answer)).toBe('pending');
  });

  it('progress that then goes silent for the bound fails (stall after start)', async () => {
    hangingEngine();
    const { answerParametrically, getModelStatus } = await load();
    const answer = answerParametrically('what is amazon', '');
    await vi.advanceTimersByTimeAsync(0);
    reportProgress({ progress: 0.2, text: 'Fetching param cache' });
    await vi.advanceTimersByTimeAsync(NO_PROGRESS_BOUND_MS);
    expect(await state(answer)).toBe('settled');
    expect(getModelStatus().phase).toBe('failed');
  });

  it('a stall-failure is sticky: no second CreateMLCEngine, even if the old create() settles later (S8 holds)', async () => {
    hangingEngine();
    const { answerParametrically, getModelStatus } = await load();
    const first = answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(NO_PROGRESS_BOUND_MS);
    expect(await state(first)).toBe('settled');
    expect(await first).toBeNull();
    expect(await answerParametrically('q', '')).toBeNull();
    expect(createEngine).toHaveBeenCalledTimes(1);
    resolveEngine(readyEngine); // the abandoned load finally lands
    await vi.advanceTimersByTimeAsync(0);
    expect(getModelStatus().phase).toBe('failed');
  });
});

describe('M1a cancel', () => {
  it('cancelModelLoad() ends a pending load: phase cancelled, waiting callers resolve null', async () => {
    hangingEngine();
    const mod = await load();
    const answer = mod.answerParametrically('what is amazon', '');
    await vi.advanceTimersByTimeAsync(0);
    expect(mod.getModelStatus().phase).toBe('loading');
    // @ts-expect-error cancelModelLoad does not exist yet (M1a adds it)
    mod.cancelModelLoad();
    expect(await state(answer)).toBe('settled');
    expect(await answer).toBeNull();
    expect(mod.getModelStatus().phase).toBe('cancelled');
  });

  it('a cancelled load is not silently restarted by the next question', async () => {
    hangingEngine();
    const mod = await load();
    const first = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(0);
    // @ts-expect-error cancelModelLoad does not exist yet (M1a adds it)
    mod.cancelModelLoad();
    expect(await state(first)).toBe('settled');
    expect(await mod.answerParametrically('q', '')).toBeNull();
    expect(createEngine).toHaveBeenCalledTimes(1);
  });
});

describe('M1c timing instrumentation (no load-time claim without data)', () => {
  it('records start, first progress, ready and the error count', async () => {
    hangingEngine();
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(5_000);
    reportProgress({ progress: 0.01, text: 'x' });
    await vi.advanceTimersByTimeAsync(10_000);
    resolveEngine(readyEngine);
    await vi.advanceTimersByTimeAsync(0);
    await answer;
    // @ts-expect-error getLoadTiming does not exist yet (M1c adds it)
    const timing = mod.getLoadTiming();
    expect(timing.startedAt).toBeTypeOf('number');
    expect(timing.firstProgressAt - timing.startedAt).toBeGreaterThanOrEqual(5_000);
    expect(timing.readyAt - timing.firstProgressAt).toBeGreaterThanOrEqual(10_000);
    expect(timing.errorCount).toBe(0);
  });

  it('counts a failed load', async () => {
    createEngine.mockRejectedValue(new Error('Failed to fetch'));
    const mod = await load();
    await mod.answerParametrically('q', '');
    // @ts-expect-error getLoadTiming does not exist yet (M1c adds it)
    expect(mod.getLoadTiming().errorCount).toBe(1);
  });
});
