// @vitest-environment jsdom
/**
 * Branch 16, commissioned class (d): weak-device model choice.
 * The ladder is feature detection (LanguageModel.availability), never UA
 * sniffing. The WebLLM tier is DEFERRED in this branch (Seat C trigger —
 * Qwen3 output hygiene is unverifiable in-branch), so what is pinned here
 * is the selection logic with stubbed config: exact model IDs, built-in →
 * WebLLM order, the weak-device rung, and a config miss failing loudly.
 * Browser behaviour is NOT proven here and is labelled UNVERIFIED in the PR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WEBLLM_MODEL_IDS,
  isWeakDevice,
  pickWebLlmModelId,
  synthesizeWithPromptApi,
} from './inference.ts';

const CONFIG = [
  { model_id: 'Qwen3-1.7B-q4f16_1-MLC' },
  { model_id: 'Qwen3-0.6B-q4f16_1-MLC' },
  { model_id: 'SomeOtherModel-MLC' },
];

beforeEach(() => {
  vi.stubGlobal('LanguageModel', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WebLLM ladder selection (deferred tier, stubbed config)', () => {
  it('pins the exact Qwen3 model IDs — no -Instruct suffix', () => {
    expect(WEBLLM_MODEL_IDS.normal).toBe('Qwen3-1.7B-q4f16_1-MLC');
    expect(WEBLLM_MODEL_IDS.weak).toBe('Qwen3-0.6B-q4f16_1-MLC');
  });

  it('a normal device selects the 1.7B pin; a weak device selects the 0.6B pin', () => {
    expect(pickWebLlmModelId(CONFIG, false)).toBe('Qwen3-1.7B-q4f16_1-MLC');
    expect(pickWebLlmModelId(CONFIG, true)).toBe('Qwen3-0.6B-q4f16_1-MLC');
  });

  it('a config miss fails loudly instead of silently disabling the tier (the F9 lesson)', () => {
    expect(() => pickWebLlmModelId([{ model_id: 'RenamedModel-MLC' }], false)).toThrow(/Qwen3-1\.7B-q4f16_1-MLC/);
    expect(() => pickWebLlmModelId([], true)).toThrow(/Qwen3-0\.6B-q4f16_1-MLC/);
  });

  it('weak-device detection reads hardware signals, not the user agent', () => {
    expect(isWeakDevice({ deviceMemory: 4, hardwareConcurrency: 8 })).toBe(true);
    expect(isWeakDevice({ deviceMemory: 8, hardwareConcurrency: 2 })).toBe(true);
    expect(isWeakDevice({ deviceMemory: 16, hardwareConcurrency: 8 })).toBe(false);
    expect(isWeakDevice({})).toBe(false);
  });
});

describe('built-in tier comes first, and the loop never triggers a download', () => {
  it('availability "available" synthesises through the Prompt API session', async () => {
    const session = {
      prompt: vi.fn(async () => 'A grounded synthesis.'),
      destroy: vi.fn(),
    };
    const create = vi.fn(async () => session);
    vi.stubGlobal('LanguageModel', { availability: async () => 'available', create });
    await expect(synthesizeWithPromptApi('system', 'user')).resolves.toBe('A grounded synthesis.');
    expect(create).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalled();
  });

  it('availability "downloadable" returns null and never calls create (consent owns downloads)', async () => {
    const create = vi.fn();
    vi.stubGlobal('LanguageModel', { availability: async () => 'downloadable', create });
    await expect(synthesizeWithPromptApi('system', 'user')).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('availability "unavailable" and a missing API both return null', async () => {
    vi.stubGlobal('LanguageModel', { availability: async () => 'unavailable', create: vi.fn() });
    await expect(synthesizeWithPromptApi('system', 'user')).resolves.toBeNull();
    vi.stubGlobal('LanguageModel', undefined);
    await expect(synthesizeWithPromptApi('system', 'user')).resolves.toBeNull();
  });

  it('a rejected draft (empty after the output gate) becomes null, not an answer', async () => {
    const session = { prompt: vi.fn(async () => '   '), destroy: vi.fn() };
    vi.stubGlobal('LanguageModel', { availability: async () => 'available', create: vi.fn(async () => session) });
    await expect(synthesizeWithPromptApi('system', 'user')).resolves.toBeNull();
  });
});
