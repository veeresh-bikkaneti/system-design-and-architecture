import { useEffect, useRef } from 'react';
import type { FocusEvent } from 'react';
import { PausableTimer } from '../../lib/pausable-timer';

/**
 * Auto-dismiss countdown that pauses while the user is engaged with the
 * toast — pointer hovering or keyboard focus anywhere inside it — and
 * restarts when they leave. A toast must never vanish from under a
 * reader's cursor or a keyboard user's focus.
 *
 * Lives in its own module (no component exports) so the hook and its
 * focus-fallback helpers stay importable by tests without tripping the
 * fast-refresh mixed-exports lint.
 */
export function usePausableDismiss(delayMs: number, onDismiss: () => void) {
  const timerRef = useRef<PausableTimer | null>(null);
  const onDismissRef = useRef(onDismiss);

  // Mirror the latest callback after render (never during render).
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const timer = new PausableTimer(
      delayMs,
      () => onDismissRef.current(),
      (cb, ms) => {
        const id = window.setTimeout(cb, ms);
        return { clear: () => window.clearTimeout(id) };
      },
    );
    timer.start();
    timerRef.current = timer;
    return () => {
      timer.cancel();
      timerRef.current = null;
    };
  }, [delayMs]);

  return {
    onMouseEnter: () => timerRef.current?.engage(),
    onMouseLeave: () => timerRef.current?.release(),
    onFocus: (event: FocusEvent<HTMLDivElement>) => {
      // React's onFocus bubbles (like focusin): Tabbing between the toast's
      // own link and dismiss button re-fires it, while the matching onBlur
      // skips the release because focus never left the toast. Without the
      // mirror of the onBlur containment check, the engagement counter
      // strands at 1 and the timer never re-arms — only count focus
      // arriving from outside the toast.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        timerRef.current?.engage();
      }
    },
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      // Focus moving between the toast's own link and dismiss button is
      // still engagement — only release when focus leaves the toast.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        timerRef.current?.release();
      }
    },
  };
}
