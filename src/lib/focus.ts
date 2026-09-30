import { useEffect, useRef, type RefObject } from 'react';

/**
 * Selector for elements that can take keyboard focus. Run it against a
 * visible container — it does not try to detect CSS visibility (unreliable
 * under jsdom), so callers must only use it where the container is on screen.
 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** All focusable elements inside `container`, in DOM order. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Move keyboard / screen-reader focus to the page's main landmark
 * (`#main-content`, the skip-link target) without scrolling. Used after
 * skip-link activation and SPA route changes so users land at the start of
 * the content instead of staying stranded on the previous control.
 */
export function focusMainContent(): void {
  const main = document.getElementById('main-content');
  if (main instanceof HTMLElement) {
    main.focus({ preventScroll: true });
  }
}

export interface UseModalFocusOptions {
  /** Whether the modal is currently open. */
  open: boolean;
  /** Ref to the dialog element that should trap focus while open. */
  dialogRef: RefObject<HTMLElement | null>;
  /** Ref to the element focus returns to when the modal closes. */
  returnFocusRef: RefObject<HTMLElement | null>;
  /** Called to request closing the modal (Escape key). */
  onClose: () => void;
}

/**
 * Accessible dialog focus behavior for a modal that stays mounted while
 * closed (so its CSS enter/exit transition can play):
 * - on open: move focus to the first focusable element inside the dialog,
 * - on close: return focus to the element that opened it,
 * - Escape closes the dialog,
 * - Tab / Shift+Tab cycle inside the dialog while it is open.
 *
 * Pair with `inert={!open}` (plus `aria-hidden`) on the dialog wrapper so the
 * closed dialog is unreachable by keyboard entirely.
 */
export function useModalFocus({
  open,
  dialogRef,
  returnFocusRef,
  onClose,
}: UseModalFocusOptions): void {
  // Escape-to-close and the Tab trap; active only while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, dialogRef, onClose]);

  // Focus in on open, focus back out on close. The `openedOnce` guard keeps
  // the initial mount (open === false) from stealing focus.
  const openedOnce = useRef(false);
  useEffect(() => {
    if (open) {
      openedOnce.current = true;
      const dialog = dialogRef.current;
      const firstFocusable = dialog ? getFocusableElements(dialog)[0] : undefined;
      const target: HTMLElement | null | undefined = firstFocusable ?? dialog;
      target?.focus();
    } else if (openedOnce.current) {
      returnFocusRef.current?.focus();
    }
  }, [open, dialogRef, returnFocusRef]);
}
