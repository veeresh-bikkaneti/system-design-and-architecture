import { useCallback, useEffect, useState } from 'react';
import {
  getAuthStatus,
  isQaBackendConfigured,
  logout,
  oauthStartUrl,
  qaApiOrigin,
} from './qaApi';
import { openOAuthPopup, type OAuthPopupResult } from './oauthPopup';

export type QaAuthState = 'unknown' | 'signed-in' | 'signed-out';

export interface QaAuth {
  state: QaAuthState;
  login: string | null;
  /** True while a sign-in/out round-trip is in flight. */
  busy: boolean;
  /** Re-check the session with the backend. */
  refresh: () => Promise<void>;
  /** Open the GitHub OAuth popup; resolves when it completes or is dismissed. */
  signIn: () => Promise<OAuthPopupResult>;
  /** Revoke the session server-side. */
  signOut: () => Promise<void>;
}

/**
 * GitHub auth state for the Veer tutor. The session itself lives in the
 * Worker's HttpOnly cookie -- this hook only tracks whether the visitor is
 * signed in (via /api/qa/auth/status) and drives the popup/logout flows.
 * No tokens ever touch the browser.
 */
export function useQaAuth(): QaAuth {
  const [state, setState] = useState<QaAuthState>('unknown');
  const [login, setLogin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const status = await getAuthStatus();
    setState(status.authenticated ? 'signed-in' : 'signed-out');
    setLogin(status.login ?? null);
  }, []);

  useEffect(() => {
    if (!isQaBackendConfigured()) return;
    let cancelled = false;
    refresh().catch(() => {
      // Backend unreachable: show the sign-in state; attempting sign-in
      // will surface the real error.
      if (!cancelled) {
        setState('signed-out');
        setLogin(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const signIn = useCallback(async (): Promise<OAuthPopupResult> => {
    setBusy(true);
    try {
      const result = await openOAuthPopup(oauthStartUrl(), qaApiOrigin());
      if (result === 'ok') await refresh();
      return result;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const signOut = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      await logout();
      setState('signed-out');
      setLogin(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, login, busy, refresh, signIn, signOut };
}
