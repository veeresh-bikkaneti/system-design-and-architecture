import { useProgressStore } from '../store/progress';
import { useSessionStore } from '../store/session';
import { mergeProgress, type ProgressSnapshot } from './progress-merge';

export const GIST_FILENAME = 'sdm-progress.json';
export const GIST_DESCRIPTION = 'system-design-mastery-progress';

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
  };
}

export function snapshotFromStore(): ProgressSnapshot {
  const p = useProgressStore.getState();
  const s = useSessionStore.getState();
  return {
    completedLessons: p.completedLessons,
    quizResults: p.quizResults,
    seenBadges: p.seenBadges,
    celebratedBadges: p.celebratedBadges,
    updatedAt: new Date().toISOString(),
    rev: s.progressRev,
  };
}

export function applySnapshot(snap: ProgressSnapshot): void {
  useProgressStore.setState({
    completedLessons: snap.completedLessons,
    quizResults: snap.quizResults,
    seenBadges: snap.seenBadges,
    celebratedBadges: snap.celebratedBadges,
  });
  useSessionStore.getState().markClean(snap.rev);
}

async function github<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init?.headers ?? {}) },
  });
  if (res.status === 401 || res.status === 403) {
    useSessionStore.getState().pause();
    useSessionStore.setState({ accessToken: null });
    throw new Error(`github ${res.status}`);
  }
  if (!res.ok) throw new Error(`github ${res.status}`);
  return (await res.json()) as T;
}

interface GistListItem {
  id: string;
  description: string | null;
  files: Record<string, { filename?: string }>;
}

interface GistDetail {
  id: string;
  files: Record<string, { content?: string; filename?: string }>;
}

export async function findOrCreateGist(token: string): Promise<string> {
  const list = await github<GistListItem[]>(token, '/gists');
  const existing = list.find(
    (g) => g.description === GIST_DESCRIPTION && Boolean(g.files[GIST_FILENAME]),
  );
  if (existing) return existing.id;

  const created = await github<{ id: string }>(token, '/gists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      public: false,
      description: GIST_DESCRIPTION,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(
            {
              v: 1,
              ...snapshotFromStore(),
            },
            null,
            2,
          ),
        },
      },
    }),
  });
  return created.id;
}

export async function pullAndMerge(token: string, gistId: string): Promise<void> {
  const detail = await github<GistDetail>(token, `/gists/${gistId}`);
  const raw = detail.files[GIST_FILENAME]?.content;
  if (!raw) return;
  const remote = JSON.parse(raw) as ProgressSnapshot;
  const merged = mergeProgress(snapshotFromStore(), remote);
  applySnapshot(merged);
}

export async function pushSnapshot(
  token: string,
  gistId: string,
  snap: ProgressSnapshot,
): Promise<void> {
  const body = {
    v: 1,
    completedLessons: snap.completedLessons,
    quizResults: snap.quizResults,
    seenBadges: snap.seenBadges,
    celebratedBadges: snap.celebratedBadges,
    updatedAt: snap.updatedAt,
    rev: snap.rev,
  };
  await github(token, `/gists/${gistId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: JSON.stringify(body, null, 2) } },
    }),
  });
  useSessionStore.getState().markClean(snap.rev);
}

export async function syncNow(opts?: { evenIfPaused?: boolean }): Promise<void> {
  const session = useSessionStore.getState();
  if (!session.isSignedIn()) return;
  if (session.pausedAt !== null && !opts?.evenIfPaused) return;
  if (!session.dirty && !opts?.evenIfPaused) return;

  const token = session.accessToken;
  if (!token) return;

  let gistId = session.gistId;
  if (!gistId) {
    gistId = await findOrCreateGist(token);
    useSessionStore.getState().setGistId(gistId);
  }

  await pullAndMerge(token, gistId);
  const snap = snapshotFromStore();
  await pushSnapshot(token, gistId, snap);
}

export function payloadHasSecrets(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const rec = json as Record<string, unknown>;
  return 'accessToken' in rec || 'githubLogin' in rec;
}
