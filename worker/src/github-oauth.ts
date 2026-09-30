export async function exchangeGitHubCode(
  code: string,
  env: { GITHUB_CLIENT_ID: string; GITHUB_CLIENT_SECRET: string },
): Promise<{ accessToken: string; login: string }> {
  if (!code) throw new Error('missing_code');
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error('no_token');
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  const user = (await userRes.json()) as { login?: string };
  if (!user.login) throw new Error('no_login');
  return { accessToken: tokenJson.access_token, login: user.login };
}
