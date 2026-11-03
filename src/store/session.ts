import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const TOKEN_KEY = 'sdm-gh-token';

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export interface SessionFields {
  githubLogin: string | null;
  gistId: string | null;
  accessToken: string | null;
  lastSyncedAt: number | null;
  progressRev: number;
  pausedAt: number | null;
  dirty: boolean;
  /** In-memory counter bumped by every markDirty; lets a push clean only what it pushed. */
  changeSeq: number;
  loginPrompt: boolean;
}

export interface SessionState extends SessionFields {
  setSession: (input: { githubLogin: string; gistId: string | null; accessToken: string }) => void;
  setGistId: (gistId: string) => void;
  clearSession: () => void;
  markDirty: () => void;
  markClean: (rev: number, atChangeSeq?: number) => void;
  pause: () => void;
  resume: () => void;
  loginPrompt: boolean;
  requestLogin: () => void;
  dismissLogin: () => void;
  isSignedIn: () => boolean;
}

const empty: SessionFields = {
  githubLogin: null,
  gistId: null,
  accessToken: null,
  lastSyncedAt: null,
  progressRev: 0,
  pausedAt: null,
  dirty: false,
  changeSeq: 0,
  loginPrompt: false,
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      ...empty,
      accessToken: readToken(),

      setSession: ({ githubLogin, gistId, accessToken }) => {
        writeToken(accessToken);
        set({ githubLogin, gistId, accessToken, pausedAt: null });
      },

      setGistId: (gistId) => set({ gistId }),

      clearSession: () => {
        writeToken(null);
        set({ ...empty });
      },

      markDirty: () => set((s) => ({ dirty: true, changeSeq: s.changeSeq + 1 })),
      // A push cleans only what it pushed: if markDirty ran after the
      // snapshot (a change during the PATCH), stay dirty so it is pushed next.
      markClean: (rev, atChangeSeq) =>
        set((s) => ({
          dirty: atChangeSeq !== undefined && atChangeSeq !== s.changeSeq,
          progressRev: rev,
          lastSyncedAt: Date.now(),
        })),
      pause: () => set({ pausedAt: Date.now() }),
      resume: () => set({ pausedAt: null }),
      loginPrompt: false,
      requestLogin: () => set({ loginPrompt: true }),
      dismissLogin: () => set({ loginPrompt: false }),
      isSignedIn: () => Boolean(get().accessToken && get().githubLogin),
    }),
    {
      name: 'sdm-session',
      partialize: (state) => ({
        githubLogin: state.githubLogin,
        gistId: state.gistId,
        progressRev: state.progressRev,
        pausedAt: state.pausedAt,
        dirty: state.dirty,
      }),
    },
  ),
);
