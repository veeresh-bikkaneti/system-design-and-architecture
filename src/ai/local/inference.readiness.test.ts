// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M1a / QA R-02: acceptance tests for the model-load readiness contract (see
 * docs/manifests/m1-ben-model-load.md and the council verdict).
 *
 * The WebLLM engine is stubbed, so these pin the state machine and the bounded
 * wait, NOT real WebGPU / Prompt API behaviour (UNVERIFIED in CI).
 *
 * Contract (the 120 s / 60 s values are UNVERIFIED defaults):
 *   - before the first progress event: 120 s; after any event: 60 s, re-armed per event.
 *   - no total cap; cancel is restartable only via retryModelLoad(); failed is sticky.
 *   - getLoadTiming(): local numbers only.
 */

const createEngine = vi.fn();

vi.mock('@mlc-ai/web-llm', () => ({
  prebuiltAppConfig: { model_list: [{ model_id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' }] },
  CreateMLCEngine: (...args: unknown[]) => createEngine(...args),
}));

const FIRST_MS = 120_000;
const STALL_MS = 60_000;

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
  chat: { completions: { create: async () => ({ choices: [{ message: { content: 'A cache keeps recent results close so repeated reads are fast.' } }] }) } },
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
  it('a create() that never settles and never reports progress fails at 120 s, not 60 s', async () => {
    hangingEngine();
    const { answerParametrically, getModelStatus } = await load();
    const answer = answerParametrically('what is amazon', '');
    await vi.advanceTimersByTimeAsync(FIRST_MS - 1);
    expect(await state(answer)).toBe('pending'); // long silence is fine before the first event
    await vi.advanceTimersByTimeAsync(1);
    expect(await state(answer)).toBe('settled');
    expect(await answer).toBeNull();
    expect(getModelStatus().phase).toBe('failed');
  });

  it('slow but steady progress is NOT failed (no total cap)', async () => {
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

  it('progress that then goes silent fails at exactly 60 s, not before and not at 120 s', async () => {
    hangingEngine();
    const { answerParametrically, getModelStatus } = await load();
    const answer = answerParametrically('what is amazon', '');
    await vi.advanceTimersByTimeAsync(0);
    reportProgress({ progress: 0.2, text: 'Fetching param cache' });
    await vi.advanceTimersByTimeAsync(STALL_MS - 1);
    expect(await state(answer)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(await state(answer)).toBe('settled');
    expect(getModelStatus().phase).toBe('failed');
  });

  it('an event at 59 s re-arms the bound (59 s more of silence is still fine, 60 s fails)', async () => {
    hangingEngine();
    const { answerParametrically, getModelStatus } = await load();
    const answer = answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(0);
    reportProgress({ progress: 0.1, text: 'a' });
    await vi.advanceTimersByTimeAsync(59_000);
    reportProgress({ progress: 0.2, text: 'b' });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(await state(answer)).toBe('pending');
    expect(getModelStatus().phase).toBe('loading');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await state(answer)).toBe('settled');
  });

  it('a stall-failure is sticky: no second CreateMLCEngine, even if the old create() settles later (S8 holds)', async () => {
    hangingEngine();
    const { answerParametrically, getModelStatus } = await load();
    const first = answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(FIRST_MS);
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
    mod.cancelModelLoad();
    expect(await state(first)).toBe('settled');
    expect(await mod.answerParametrically('q', '')).toBeNull();
    expect(createEngine).toHaveBeenCalledTimes(1);
  });
});

describe('M1a timing instrumentation (no load-time claim without data)', () => {
  it('records start, first progress, ready, the event count and the error count', async () => {
    hangingEngine();
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(5_000);
    reportProgress({ progress: 0.01, text: 'x' });
    await vi.advanceTimersByTimeAsync(10_000);
    resolveEngine(readyEngine);
    await vi.advanceTimersByTimeAsync(0);
    await answer;
    const timing = mod.getLoadTiming();
    expect(timing.startedAt).toBeTypeOf('number');
    expect(timing.firstProgressAt! - timing.startedAt!).toBeGreaterThanOrEqual(5_000);
    expect(timing.readyAt! - timing.firstProgressAt!).toBeGreaterThanOrEqual(10_000);
    expect(timing.progressEvents).toBe(1);
    expect(timing.errorCount).toBe(0);
  });

  it('counts a failed load and keeps no message text', async () => {
    createEngine.mockRejectedValue(new Error('Failed to fetch'));
    const mod = await load();
    await mod.answerParametrically('q', '');
    const timing = mod.getLoadTiming();
    expect(timing.errorCount).toBe(1);
    expect(Object.values(timing).every((v) => v === null || typeof v === 'number')).toBe(true);
  });
});

describe('M1a late settles and retry', () => {
  it('a late resolve after cancel never reaches ready, publishes nothing, and unloads the engine', async () => {
    hangingEngine();
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(0);
    mod.cancelModelLoad();
    await answer;
    const seen: unknown[] = [];
    const unsubscribe = mod.subscribeModel((s) => seen.push(s));
    seen.length = 0; // drop the replay of the current status
    reportProgress({ progress: 0.9, text: 'late' });
    const unload = vi.fn();
    resolveEngine({ ...readyEngine, unload });
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    expect(seen).toEqual([]);
    expect(mod.getModelStatus().phase).toBe('cancelled');
    expect(unload).toHaveBeenCalledTimes(1);
    expect(mod.getLoadTiming().progressEvents).toBe(0);
  });

  it("cancel then retry makes a second CreateMLCEngine call and the old call's late resolve is ignored", async () => {
    hangingEngine();
    const mod = await load();
    const first = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(0);
    const resolveOld = resolveEngine;
    mod.cancelModelLoad();
    await first;
    mod.retryModelLoad();
    await vi.advanceTimersByTimeAsync(0);
    expect(createEngine).toHaveBeenCalledTimes(2);
    expect(mod.getModelStatus().phase).toBe('loading');
    resolveOld(readyEngine); // stale generation
    await vi.advanceTimersByTimeAsync(0);
    expect(mod.getModelStatus().phase).toBe('loading');
    resolveEngine(readyEngine);
    await vi.advanceTimersByTimeAsync(0);
    expect(mod.getModelStatus().phase).toBe('ready');
    expect(await mod.answerParametrically('q', '')).toContain('cache');
  });

  it('retryModelLoad() after a failure is a no-op (failed is sticky)', async () => {
    hangingEngine();
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(FIRST_MS);
    await answer;
    mod.retryModelLoad();
    await vi.advanceTimersByTimeAsync(0);
    expect(createEngine).toHaveBeenCalledTimes(1);
    expect(mod.getModelStatus().phase).toBe('failed');
  });

  it('retryModelLoad() while idle or loading does nothing', async () => {
    hangingEngine();
    const mod = await load();
    mod.retryModelLoad();
    expect(createEngine).not.toHaveBeenCalled();
    void mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(0);
    mod.retryModelLoad();
    expect(createEngine).toHaveBeenCalledTimes(1);
  });
});

describe('Branch 1 generation stall bound (F1: guards on both generate() calls)', () => {
  // Mirrors GENERATION_STALL_TIMEOUT_MS in inference.ts. Generation reports
  // no progress events (generate() returns one Promise<string>), so a single
  // stall-style bound applies; the value is an UNVERIFIED default.
  const GEN_MS = 60_000;
  const GOOD = 'A cache keeps recent results close so repeated reads are fast.';

  it('a Prompt API prompt() that never settles settles null at the stall bound', async () => {
    let resolvePrompt: (value: string) => void = () => {};
    const session = {
      destroy: vi.fn(),
      prompt: () =>
        new Promise<string>((resolve) => {
          resolvePrompt = resolve;
        }),
    };
    const create = vi.fn(async () => session);
    vi.stubGlobal('LanguageModel', { availability: () => Promise.resolve('available'), create });
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(GEN_MS - 1);
    expect(await state(answer)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(await state(answer)).toBe('settled');
    expect(await answer).toBeNull();
    // The late resolve is discarded: it cannot write a result after the bound.
    resolvePrompt(GOOD);
    await vi.advanceTimersByTimeAsync(0);
    expect(await answer).toBeNull();
    expect(mod.getModelStatus().phase).toBe('ready');
  });

  it('a WebLLM chat.completions.create() that never settles settles null at the stall bound', async () => {
    createEngine.mockResolvedValue({
      chat: { completions: { create: () => new Promise(() => {}) } },
    });
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(0); // let the load reach ready + generate start
    expect(mod.getModelStatus().phase).toBe('ready');
    await vi.advanceTimersByTimeAsync(GEN_MS - 1);
    expect(await state(answer)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(await state(answer)).toBe('settled');
    expect(await answer).toBeNull();
  });

  it('rewriteWithModel is bounded the same way (the lesson-rewrite generate() call)', async () => {
    createEngine.mockResolvedValue({
      chat: { completions: { create: () => new Promise(() => {}) } },
    });
    const mod = await load();
    const draft = mod.rewriteWithModel('q', 'A cache keeps recent results close.', '');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(GEN_MS);
    expect(await state(draft)).toBe('settled');
    expect(await draft).toBeNull();
  });

  it('a generation that settles before the bound still returns its draft', async () => {
    createEngine.mockResolvedValue(readyEngine);
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(0);
    expect(await answer).toContain('cache');
  });
});

describe('M1a Prompt API create()', () => {
  type Opts = { monitor?: (m: EventTarget) => void; signal?: AbortSignal };
  const hangingPrompt = () => {
    let monitor: Opts['monitor'];
    let signal: AbortSignal | undefined;
    const create = vi.fn((opts: Opts) => {
      monitor = opts.monitor;
      signal = opts.signal;
      return new Promise(() => {});
    });
    vi.stubGlobal('LanguageModel', { availability: () => Promise.resolve('downloadable'), create });
    return { monitor: () => monitor, signal: () => signal };
  };

  it('a create() with no event fails at 120 s and aborts the signal it was given', async () => {
    const p = hangingPrompt();
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(FIRST_MS - 1);
    expect(await state(answer)).toBe('pending');
    expect(p.signal()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await state(answer)).toBe('settled');
    expect(mod.getModelStatus().phase).toBe('failed');
    expect(p.signal()?.aborted).toBe(true);
    expect(createEngine).not.toHaveBeenCalled(); // an abandoned load must not fall through to WebLLM
  });

  it('downloadprogress events re-arm the 60 s stall bound', async () => {
    const p = hangingPrompt();
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(0);
    const target = new EventTarget();
    p.monitor()?.(target);
    await vi.advanceTimersByTimeAsync(30_000);
    target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 0.1 }));
    expect(mod.getModelStatus().progress).toBe(10);
    await vi.advanceTimersByTimeAsync(STALL_MS - 1);
    expect(await state(answer)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(await state(answer)).toBe('settled');
    expect(mod.getModelStatus().phase).toBe('failed');
  });

  it('cancel aborts the Prompt API signal', async () => {
    const p = hangingPrompt();
    const mod = await load();
    const answer = mod.answerParametrically('q', '');
    await vi.advanceTimersByTimeAsync(0);
    mod.cancelModelLoad();
    await answer;
    expect(p.signal()?.aborted).toBe(true);
    expect(mod.getModelStatus().phase).toBe('cancelled');
  });
});
