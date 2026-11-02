// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createEngine = vi.fn();

vi.mock('@mlc-ai/web-llm', () => ({
  prebuiltAppConfig: {
    model_list: [{ model_id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' }],
  },
  CreateMLCEngine: (...args: unknown[]) => createEngine(...args),
}));

// jsdom has no navigator.gpu, and the engine now asks for an adapter before it
// touches WebLLM. These helpers fake a GPU (or the lack of one).
const withGpu = (requestAdapter: () => Promise<unknown>) =>
  vi.stubGlobal('navigator', { gpu: { requestAdapter } });
const withAdapter = () => withGpu(() => Promise.resolve({}));

const fakeLanguageModel = (availability: string, create = vi.fn()) => {
  const session = { destroy: vi.fn(), prompt: vi.fn() };
  create.mockResolvedValue(session);
  vi.stubGlobal('LanguageModel', { availability: () => Promise.resolve(availability), create });
  return create;
};

const load = async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return import('./inference.ts');
};

beforeEach(() => {
  createEngine.mockReset();
  createEngine.mockRejectedValue(new Error('Failed to fetch'));
  // A failed engine is cached for the page lifetime, so every test needs a fresh module.
  vi.resetModules();
  vi.stubGlobal('LanguageModel', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WebLLM load failure', () => {
  it('does not call CreateMLCEngine again after the first load fails', async () => {
    withAdapter(); // gate needs an adapter so this still reaches CreateMLCEngine
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { answerParametrically, getModelStatus } = await import('./inference.ts');
    expect(await answerParametrically('what is amazon', '')).toBeNull();
    expect(getModelStatus().phase).toBe('failed');
    expect(createEngine).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBeInstanceOf(Error);

    expect(await answerParametrically('what is amazon', '')).toBeNull();
    expect(createEngine).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('inference ladder', () => {
  it('S1: Prompt API available -> prompt-api engine', async () => {
    fakeLanguageModel('available');
    const { answerParametrically, getModelStatus } = await load();
    await answerParametrically('q', '');
    expect(getModelStatus().detail).toBe('Built-in browser AI');
    expect(createEngine).not.toHaveBeenCalled();
  });

  it('S2: no Prompt API + adapter -> WebLLM is attempted', async () => {
    withAdapter();
    const { answerParametrically } = await load();
    await answerParametrically('q', '');
    expect(createEngine).toHaveBeenCalledTimes(1);
  });

  it('S3: no Prompt API + no navigator.gpu -> failed, MODEL_UNAVAILABLE, web-llm untouched', async () => {
    vi.stubGlobal('navigator', {});
    const { answerParametrically, getModelStatus, MODEL_UNAVAILABLE } = await load();
    expect(await answerParametrically('q', '')).toBeNull();
    expect(getModelStatus()).toMatchObject({ phase: 'failed', detail: MODEL_UNAVAILABLE });
    expect(createEngine).not.toHaveBeenCalled();
  });

  it('S3b: requestAdapter resolves null -> same as no GPU', async () => {
    withGpu(() => Promise.resolve(null));
    const { answerParametrically, getModelStatus, MODEL_UNAVAILABLE } = await load();
    expect(await answerParametrically('q', '')).toBeNull();
    expect(getModelStatus()).toMatchObject({ phase: 'failed', detail: MODEL_UNAVAILABLE });
    expect(createEngine).not.toHaveBeenCalled();
  });

  it('S4: Prompt API "unavailable" + adapter -> WebLLM', async () => {
    const create = fakeLanguageModel('unavailable');
    withAdapter();
    const { answerParametrically } = await load();
    await answerParametrically('q', '');
    expect(create).not.toHaveBeenCalled();
    expect(createEngine).toHaveBeenCalledTimes(1);
  });

  it('S5: Prompt API create() throws -> falls through to WebLLM', async () => {
    const create = fakeLanguageModel('available');
    create.mockRejectedValue(new Error('boom'));
    withAdapter();
    const { answerParametrically } = await load();
    await answerParametrically('q', '');
    expect(createEngine).toHaveBeenCalledTimes(1);
  });

  it('S6: requestAdapter throws -> treated as no GPU', async () => {
    withGpu(() => Promise.reject(new Error('gpu exploded')));
    const { answerParametrically, getModelStatus, MODEL_UNAVAILABLE } = await load();
    expect(await answerParametrically('q', '')).toBeNull();
    expect(getModelStatus()).toMatchObject({ phase: 'failed', detail: MODEL_UNAVAILABLE });
    expect(createEngine).not.toHaveBeenCalled();
  });

  it('S7: availability "downloadable" still calls create() (pinned; opt-in is a follow-up ticket)', async () => {
    const create = fakeLanguageModel('downloadable');
    const { answerParametrically } = await load();
    await answerParametrically('q', '');
    expect(create).toHaveBeenCalled();
  });

  it('S8: a gate failure is cached; reload is the retry', async () => {
    const requestAdapter = vi.fn().mockResolvedValue(null);
    withGpu(requestAdapter);
    const { answerParametrically } = await load();
    await answerParametrically('q', '');
    await answerParametrically('q', '');
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it('S9: Prompt API wins even with no GPU', async () => {
    fakeLanguageModel('available');
    vi.stubGlobal('navigator', {});
    const { answerParametrically, getModelStatus } = await load();
    await answerParametrically('q', '');
    expect(getModelStatus().phase).toBe('ready');
    expect(createEngine).not.toHaveBeenCalled();
  });
});

describe('output gate at the call site (QA R-01)', () => {
  it('answerParametrically returns null when the model echoes its system prompt', async () => {
    const echo =
      'CPU backend\nTopK: 64, Temp: 1\nYou are an expert system design tutor. The user has asked a general software architecture question that falls outside the specific coursework.\nModel:';
    const create = fakeLanguageModel('available');
    const session = { destroy: vi.fn(), prompt: vi.fn().mockResolvedValue(echo) };
    create.mockResolvedValue(session);
    vi.stubGlobal('navigator', {});
    const { answerParametrically } = await load();
    expect(await answerParametrically('how do I set up a python venv for AI work', '')).toBeNull();
  });
});

describe('output gate: rewrite path keeps the card answer (QA R-01)', () => {
  it('rewriteWithModel returns null when the model echoes the rewrite prompt (panel keeps the deterministic card answer)', async () => {
    const echo =
      'You are Ben, a patient tutor talking with a beginner. Stay in that role. Sound like a person: warm, short sentences, everyday words. Two to five sentences.';
    const create = fakeLanguageModel('available');
    create.mockResolvedValue({ destroy: vi.fn(), prompt: vi.fn().mockResolvedValue(echo) });
    vi.stubGlobal('navigator', {});
    const { rewriteWithModel } = await load();
    expect(await rewriteWithModel('what is a cache', 'A cache keeps hot data close to the reader.', '')).toBeNull();
  });
});
