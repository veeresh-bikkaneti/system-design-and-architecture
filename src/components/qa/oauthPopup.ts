/**
 * GitHub OAuth popup handshake for the Veer tutor.
 *
 * The Worker serves the OAuth callback page on the API origin; that page
 * postMessages `{ type: 'qa-auth', ok: true }` to the opener and closes
 * itself. This module opens the popup and waits for that message.
 *
 * Security: the message is accepted only when BOTH
 *   - `event.origin` equals the Worker API origin (the popup document lives
 *     there -- never the page origin), and
 *   - `event.source` is the popup window we opened.
 * Anything else (page self-messages, injected iframes, other tabs) is
 * ignored. The module is DOM-thin -- all window access goes through the
 * global `window` so unit tests can stub it without jsdom.
 */

export type OAuthPopupResult = 'ok' | 'blocked' | 'dismissed';

const POPUP_FEATURES = 'width=600,height=700,menubar=no,toolbar=no,location=yes,status=no';

interface PopupWindow {
  closed: boolean;
  close(): void;
}

interface MessageLike {
  origin: string;
  source: unknown;
  data: unknown;
}

export function openOAuthPopup(
  startUrl: string,
  expectedOrigin: string,
  timeoutMs = 5 * 60 * 1000,
): Promise<OAuthPopupResult> {
  const popup = window.open(startUrl, 'veer-github-signin', POPUP_FEATURES) as
    | PopupWindow
    | null;
  if (!popup) return Promise.resolve('blocked');
  // Narrowed once: closures below can't see the early-return narrowing.
  const win: PopupWindow = popup;

  return new Promise<OAuthPopupResult>((resolve) => {
    let settled = false;
    const onMessage = (event: MessageLike) => {
      if (event.origin !== expectedOrigin) return;
      if (event.source !== popup) return;
      const data = event.data as { type?: unknown; ok?: unknown } | null;
      if (!data || typeof data !== 'object' || data.type !== 'qa-auth') return;
      done(data.ok === true ? 'ok' : 'dismissed');
    };
    const timer = window.setTimeout(() => done('dismissed'), timeoutMs);
    function done(result: OAuthPopupResult) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage as (e: MessageEvent) => void);
      if (!win.closed) win.close();
      resolve(result);
    }
    window.addEventListener('message', onMessage as (e: MessageEvent) => void);
  });
}
