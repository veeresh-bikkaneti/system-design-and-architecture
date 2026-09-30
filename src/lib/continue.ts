import { lessons } from './lessons';
import { useSessionStore } from '../store/session';

export function nextUnfinishedSlug(completed: string[]): string | null {
  const sorted = [...lessons].sort((a, b) => a.meta.order - b.meta.order);
  const next = sorted.find((lesson) => !completed.includes(lesson.meta.slug));
  return next?.meta.slug ?? null;
}

export function requireSignInToMutate(): boolean {
  return !useSessionStore.getState().isSignedIn();
}
