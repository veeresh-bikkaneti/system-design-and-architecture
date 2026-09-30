import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgressStore } from '../store/progress';
import { useSessionStore } from '../store/session';
import { nextUnfinishedSlug } from '../lib/continue';
import { findOrCreateGist, pullAndMerge, syncNow } from '../lib/gist-sync';
import { startIdleWatch } from '../lib/idle';

export function AuthBar() {
  const navigate = useNavigate();
  const signedIn = useSessionStore((s) => Boolean(s.accessToken && s.githubLogin));
  const login = useSessionStore((s) => s.githubLogin);
  const pausedAt = useSessionStore((s) => s.pausedAt);
  const lastSyncedAt = useSessionStore((s) => s.lastSyncedAt);
  const completed = useProgressStore((s) => s.completedLessons);
  const loginOpen = useSessionStore((s) => s.loginPrompt);
  const setLoginOpen = (open: boolean) =>
    open ? useSessionStore.getState().requestLogin() : useSessionStore.getState().dismissLogin();
  const [pat, setPat] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => startIdleWatch(), []);
  useEffect(() => useProgressStore.subscribe(() => {
    if (useSessionStore.getState().isSignedIn()) useSessionStore.getState().markDirty();
  }), []);

  async function continueLearning() {
    if (pausedAt) {
      useSessionStore.getState().resume();
      await syncNow({ evenIfPaused: true });
    }
    if (!useSessionStore.getState().isSignedIn()) {
      setLoginOpen(true);
      return;
    }
    const slug = nextUnfinishedSlug(useProgressStore.getState().completedLessons);
    navigate(slug ? `/lesson/${slug}` : '/');
  }

  async function signInWithPat() {
    setError(null);
    const token = pat.trim();
    if (!token) {
      setError('Paste a fine-grained token with Gist access.');
      return;
    }
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      });
      if (!userRes.ok) throw new Error('GitHub rejected that token.');
      const user = (await userRes.json()) as { login?: string };
      if (!user.login) throw new Error('GitHub rejected that token.');
      useSessionStore.getState().setSession({ githubLogin: user.login, gistId: null, accessToken: token });
      const gistId = await findOrCreateGist(token);
      useSessionStore.getState().setGistId(gistId);
      useSessionStore.getState().markDirty();
      await pullAndMerge(token, gistId);
      await syncNow();
      setLoginOpen(false);
      setPat('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  }

  function startOauth() {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;
    if (!clientId) {
      setLoginOpen(true);
      return;
    }
    const redirect = `${window.location.origin}${import.meta.env.BASE_URL}oauth/callback`;
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('scope', 'gist');
    url.searchParams.set('redirect_uri', redirect);
    window.location.assign(url.toString());
  }

  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;

  return (
    <>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => void continueLearning()} className="hidden rounded-xl px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200/60 sm:inline-flex dark:text-stone-300">
          Continue
        </button>
        {signedIn ? (
          <span className="hidden max-w-[10rem] truncate text-xs text-stone-500 sm:inline dark:text-stone-400">
            {pausedAt ? 'Paused' : lastSyncedAt ? 'Synced' : login}
          </span>
        ) : (
          <button type="button" onClick={startOauth} className="rounded-xl px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200/60 dark:text-stone-300">
            Sign in with GitHub
          </button>
        )}
      </div>
      {pausedAt && signedIn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/40 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-6 shadow-lift dark:bg-stone-900">
            <h2 className="font-display text-xl font-semibold">Session paused</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">Progress is saved. Continue when you are back.</p>
            <button type="button" className="mt-4 rounded-xl bg-accent-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void continueLearning()}>Continue</button>
          </div>
        </div>
      )}
      {loginOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift dark:bg-stone-900">
            <h2 className="font-display text-xl font-semibold">Sign in with GitHub</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">One lesson is free. Saving, completing, and resuming on another device needs GitHub.</p>
            {clientId ? (
              <button type="button" className="mt-4 rounded-xl bg-accent-700 px-4 py-2 text-sm font-semibold text-white" onClick={startOauth}>Continue with GitHub</button>
            ) : (
              <>
                <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Fine-grained PAT (Gists: read/write)
                  <input className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950" value={pat} onChange={(e) => setPat(e.target.value)} type="password" autoComplete="off" />
                </label>
                {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
                <button type="button" className="mt-4 rounded-xl bg-accent-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void signInWithPat()}>Save and sync</button>
              </>
            )}
            <button type="button" className="mt-3 block text-sm text-stone-500 underline" onClick={() => setLoginOpen(false)}>Not now</button>
          </div>
        </div>
      )}
      <span className="sr-only">{completed.length} lessons completed</span>
    </>
  );
}

export function OauthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const worker = import.meta.env.VITE_WORKER_URL as string | undefined;
    if (!code || !worker) {
      setError('Missing OAuth code or worker URL. Use a GitHub PAT instead.');
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`${worker.replace(/\/$/, '')}/auth/github/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) throw new Error('OAuth exchange failed.');
        const body = (await res.json()) as { accessToken: string; login: string };
        useSessionStore.getState().setSession({ githubLogin: body.login, gistId: null, accessToken: body.accessToken });
        useSessionStore.getState().markDirty();
        await syncNow();
        window.history.replaceState({}, '', `${import.meta.env.BASE_URL}oauth/callback`);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'OAuth failed.');
      }
    })();
  }, [navigate]);
  return <p className="py-16 text-center text-sm text-stone-600 dark:text-stone-400">{error ?? 'Signing you in…'}</p>;
}
