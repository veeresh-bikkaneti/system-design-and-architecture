// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createEngine = vi.fn();

vi.mock('@mlc-ai/web-llm', () => ({
  prebuiltAppConfig: {
    model_list: [{ model_id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' }],
  },
  CreateMLCEngine: (...args: unknown[]) => createEngine(...args),
}));

describe('WebLLM load failure', () => {
  beforeEach(() => {
    createEngine.mockReset();
    createEngine.mockRejectedValue(new Error('Failed to fetch'));
    vi.resetModules();
  });

  it('does not call CreateMLCEngine again after the first load fails', async () => {
    const { answerParametrically, getModelStatus } = await import('./inference.ts');
    expect(await answerParametrically('what is amazon', '')).toBeNull();
    expect(getModelStatus().phase).toBe('failed');
    expect(createEngine).toHaveBeenCalledTimes(1);

    expect(await answerParametrically('what is amazon', '')).toBeNull();
    expect(createEngine).toHaveBeenCalledTimes(1);
  });
});
