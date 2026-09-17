import { beforeAll, describe, expect, it } from 'vitest';
import { stubBrowserStorage } from '../test-utils/memoryStorage';

/**
 * Provider-agnosticism is a product requirement: the tutor must work with any
 * AI provider (Anthropic, OpenAI, or any OpenAI-compatible endpoint via the
 * "custom" provider) — never locked to a single one. These tests pin that
 * contract: the provider registry, the streaming parser every non-Anthropic
 * provider funnels through, and the settings migration that must never clobber
 * a user-supplied custom endpoint.
 */

// Stub the browser storage surface before importing the aiSettings module,
// whose zustand persist store reads window.localStorage at creation time.
stubBrowserStorage();

let aiSettings: typeof import('./aiSettings');

beforeAll(async () => {
  aiSettings = await import('./aiSettings');
});

describe('isAIProvider', () => {
  it('accepts the three supported providers', () => {
    expect(aiSettings.isAIProvider('anthropic')).toBe(true);
    expect(aiSettings.isAIProvider('openai')).toBe(true);
    expect(aiSettings.isAIProvider('custom')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['github-copilot', '', null, undefined, 42, 'ANTHROPIC']) {
      expect(aiSettings.isAIProvider(bad)).toBe(false);
    }
  });
});

describe('PROVIDER_PRESETS', () => {
  it('covers every provider isAIProvider accepts', () => {
    for (const id of ['anthropic', 'openai', 'custom'] as const) {
      expect(aiSettings.PROVIDER_PRESETS[id].id).toBe(id);
    }
  });

  it('the custom preset is a blank slate for any OpenAI-compatible endpoint', () => {
    const custom = aiSettings.PROVIDER_PRESETS.custom;
    expect(custom.defaultBaseUrl).toBe('');
    expect(custom.defaultModel).toBe('');
  });
});

describe('migrateAiSettings', () => {
  it('preserves a user-supplied custom endpoint and model', () => {
    const out = aiSettings.migrateAiSettings({
      provider: 'custom',
      baseUrl: 'https://llm.example.com/v1',
      model: 'my-model',
    });
    expect(out).toEqual({
      provider: 'custom',
      baseUrl: 'https://llm.example.com/v1',
      model: 'my-model',
    });
  });

  it('drops a legacy persisted apiKey — the session-only privacy promise', () => {
    const out = aiSettings.migrateAiSettings({
      apiKey: 'sk-ant-secret-that-must-not-survive',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-5',
    });
    expect(out).not.toHaveProperty('apiKey');
  });

  it('falls back to provider defaults for missing or unknown values', () => {
    const empty = aiSettings.migrateAiSettings({});
    expect(empty.provider).toBe(aiSettings.DEFAULT_PROVIDER);
    expect(empty.baseUrl).toBe(
      aiSettings.PROVIDER_PRESETS[aiSettings.DEFAULT_PROVIDER].defaultBaseUrl,
    );

    const bogus = aiSettings.migrateAiSettings({ provider: 'github-copilot' });
    expect(bogus.provider).toBe(aiSettings.DEFAULT_PROVIDER);
  });

  it('fills blank baseUrl/model from the selected provider preset', () => {
    const out = aiSettings.migrateAiSettings({ provider: 'openai', baseUrl: '', model: '' });
    expect(out.baseUrl).toBe(aiSettings.PROVIDER_PRESETS.openai.defaultBaseUrl);
    expect(out.model).toBe(aiSettings.PROVIDER_PRESETS.openai.defaultModel);
  });
});
