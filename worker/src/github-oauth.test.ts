import { describe, expect, it, vi } from 'vitest';
import { exchangeGitHubCode } from './github-oauth';

describe('exchangeGitHubCode', () => {
  it('returns login and token for a valid code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('access_token')) {
          return new Response(JSON.stringify({ access_token: 'gho_test' }), { status: 200 });
        }
        return new Response(JSON.stringify({ login: 'veer' }), { status: 200 });
      }),
    );
    await expect(
      exchangeGitHubCode('abc', { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' }),
    ).resolves.toEqual({ accessToken: 'gho_test', login: 'veer' });
    vi.unstubAllGlobals();
  });

  it('throws when GitHub omits a token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'bad_verification_code' }), { status: 200 })),
    );
    await expect(
      exchangeGitHubCode('nope', { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' }),
    ).rejects.toThrow('no_token');
    vi.unstubAllGlobals();
  });
});
