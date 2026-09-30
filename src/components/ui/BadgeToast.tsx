import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { badgeIconUrl, getBadgesWithStatus, type BadgeDefinition } from '../../lib/badges';
import { resolveDismissFocusTarget } from '../../lib/badge-toast-focus';
import { useProgressStore } from '../../store/progress';
import { Icon } from './Icon';
import { usePausableDismiss } from './usePausableDismiss';

/** How long a toast stays up before auto-dismissing (when untouched). */
const TOAST_MS = 6000;
/** Cap stacked toasts so a bulk unlock (e.g. finishing a tier) stays tidy. */
const MAX_VISIBLE = 3;

interface Toast extends BadgeDefinition {
  key: number;
}

function ToastItem({
  toast,
  onDismiss,
  containerRef,
}: {
  toast: Toast;
  onDismiss: () => void;
  containerRef: (el: HTMLDivElement | null) => void;
}) {
  const interactionHandlers = usePausableDismiss(TOAST_MS, onDismiss);

  return (
    <div
      ref={containerRef}
      {...interactionHandlers}
      className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-amber-200/80 bg-white/95 px-4 py-3 shadow-lift backdrop-blur dark:border-amber-900/60 dark:bg-stone-900/95"
    >
      <img
        src={badgeIconUrl(toast.iconFile)}
        alt=""
        aria-hidden="true"
        className="h-10 w-10 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          Badge earned
        </p>
        <Link
          to={`/badges/${toast.id}`}
          className="block truncate text-sm font-semibold text-stone-900 underline-offset-2 hover:underline dark:text-stone-100"
        >
          {toast.name}
        </Link>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss: ${toast.name}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
      >
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Global host for "badge earned" announcements. Mount once (in Layout).
 *
 * Badges are derived from the progress store, so there is no explicit award
 * event to hook: this diffs the unlocked set on every progress change and
 * toasts whatever newly unlocked. The first run only establishes the
 * baseline, so badges earned on previous visits never pop on page load.
 * Each badge is announced at most once per session.
 *
 * Accessibility notes:
 * - Screen-reader announcements live in a dedicated visually-hidden
 *   `aria-live` region. The visual toasts are NOT a live region: their
 *   link + dismiss button are interactive, and interactive controls
 *   inside a live region get re-announced as the region updates.
 * - The auto-dismiss timer pauses on hover and on focus-within, so a
 *   toast never disappears from under the user.
 * - If the user was focused inside a toast when it dismisses, focus moves
 *   to the next remaining toast's controls, else the first *visible*
 *   Badges nav link, else the main landmark — never dropped to <body>.
 *
 * This is independent of the badge-detail celebration (confetti + the
 * `celebratedBadges` store slice) — that effect is untouched.
 */
export function BadgeToastHost() {
  const completedLessons = useProgressStore((state) => state.completedLessons);
  const quizResults = useProgressStore((state) => state.quizResults);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prevIdsRef = useRef<string[] | null>(null);
  const announcedRef = useRef<Set<string>>(new Set());
  const keyRef = useRef(0);
  const toastElsRef = useRef(new Map<number, HTMLDivElement | null>());
  /** Set when a dismiss removed the focused toast; consumed by the effect. */
  const pendingFocusRef = useRef<{ afterKey: number } | null>(null);

  useEffect(() => {
    const unlocked = getBadgesWithStatus({ completedLessons, quizResults }).filter(
      (badge) => badge.unlocked,
    );
    const ids = unlocked.map((badge) => badge.id);

    if (prevIdsRef.current === null) {
      prevIdsRef.current = ids;
      return;
    }

    const prev = new Set(prevIdsRef.current);
    prevIdsRef.current = ids;

    const fresh = unlocked.filter(
      (badge) => !prev.has(badge.id) && !announcedRef.current.has(badge.id),
    );
    if (fresh.length === 0) return;

    fresh.forEach((badge) => announcedRef.current.add(badge.id));
    setToasts((prevToasts) => {
      const existing = new Set(prevToasts.map((toast) => toast.id));
      const next = [
        ...prevToasts,
        ...fresh
          .filter((badge) => !existing.has(badge.id))
          .map((badge) => ({ ...badge, key: (keyRef.current += 1) })),
      ];
      return next.slice(-MAX_VISIBLE);
    });
  }, [completedLessons, quizResults]);

  const handleDismiss = useCallback((key: number) => {
    const el = toastElsRef.current.get(key);
    if (el?.contains(document.activeElement)) {
      // Focus was inside the toast being removed — plan a move once the
      // DOM has updated, instead of letting it drop to <body>.
      pendingFocusRef.current = { afterKey: key };
    }
    toastElsRef.current.delete(key);
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  // Runs after the toast list re-renders: relocate focus stranded by a
  // dismiss. Preference order: next remaining toast's controls, first
  // remaining toast's controls, the first visible Badges nav link, the
  // main landmark — never dropped to <body>.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    resolveDismissFocusTarget(document, toastElsRef.current, toasts, pending.afterKey)?.focus({
      preventScroll: true,
    });
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <>
      {/* Announcement-only live region: plain text, no interactive content. */}
      <div aria-live="polite" className="sr-only">
        {toasts.map((toast) => (
          <p key={toast.key}>Badge earned: {toast.name}</p>
        ))}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.key}
            toast={toast}
            onDismiss={() => handleDismiss(toast.key)}
            containerRef={(el) => {
              if (el) toastElsRef.current.set(toast.key, el);
              else toastElsRef.current.delete(toast.key);
            }}
          />
        ))}
      </div>
    </>
  );
}
