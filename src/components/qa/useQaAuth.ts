import { useCallback, useState } from 'react';
import {
  getAuthStatus,
  isQaBackendConfigured,
  logout,
  oauthStartUrl,
  qaApiOrigin,
  type QaAuthStatus,
} from './qaApi';
import { openOAuthPopup, type OAuthPopupResult } from './oauthPopup';

export type QaAuthState = 'unknown' | 'signed-in' | 'signed-out';

export interface QaAuth {
  state: QaAuthState;
  login: string | null;
  /** True while a sign-in/out round-trip is in flight. */
  busy: boolean;
  /**
   * Re-check the session with the backend. Resolves with the fresh status
   * (null when no backend is configured) so a caller can act on it in the
   * same tick; rejects when the backend is unreachable.
   */
  refresh: () => Promise<QaAuthStatus | null>;
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
 *
 * Adapted from the September original for the merged Ben+Veer shell
 * (Manifest 2): the September hook probed /api/qa/auth/status on mount,
 * but in the merged shell Ben is the default tutor for everyone and the
 * manifest's H1 requires a signed-out student chatting with Ben to make
 * zero /api/qa/* requests -- and the status probe is itself an /api/qa/*
 * request. The probe is therefore LAZY: state stays 'unknown' and no
 * request is made until the student engages the Veer affordance, which is
 * when the panel calls refresh() (and signIn() refreshes after the popup).
 */
export function useQaAuth(): QaAuth {
  const [state, setState] = useState<QaAuthState>('unknown');
  const [login, setLogin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<QaAuthStatus | null> => {
    if (!isQaBackendConfigured()) {
      // No backend wired into this build: there is no session to find, and
      // asking would hit the static host. Report signed-out locally.
      setState('signed-out');
      setLogin(null);
      return null;
    }
    const status = await getAuthStatus();
    setState(status.authenticated ? 'signed-in' : 'signed-out');
    setLogin(status.login ?? null);
    return status;
  }, []);

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
