import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui/Icon';
import { extractLessonBlocks } from '../lib/listen';

/** Grace period so the pointer can travel from a paragraph to its button. */
const HIDE_DELAY_MS = 250;

/** Button size (h-7 w-7) plus gap, in px: how far left of the block it sits. */
const BUTTON_OFFSET = 36;

interface Anchor {
  /** Block index (see `lib/listen-seek.ts`) the button would start at. */
  block: number;
  /** Page coordinates of the button's top-left corner. */
  top: number;
  left: number;
}

/**
 * "Read from here": a small ▶ that appears in the margin of the paragraph
 * the learner is pointing at, and starts Listen at that block.
 *
 * It never changes what clicking the lesson text does. Nothing is bound to
 * the paragraphs themselves: the affordance is one delegated, passive-feeling
 * listener set that only *shows* a separate button (hover for mouse/pen, a
 * tap for touch), so links, text selection and dragging behave normally and
 * only the explicit ▶ starts playback. Blocks are the same
 * `extractLessonBlocks` list both players use, so skipped regions (code,
 * diagrams, quizzes) offer nothing.
 *
 * The button is portaled to <body> rather than injected into the lesson DOM:
 * the prose is React-rendered MDX, and a button inside a paragraph would also
 * leak into its `textContent` (which the narration alignment compares).
 * Keyboard and screen-reader users reach the same capability through the
 * player's previous/next controls, ←/→ and "Continue from where you left off"
 * — a pointer-positioned button has no sensible place in the tab order.
 */
export function ReadFromHere({
  articleSelector,
  enabled,
  onSelect,
}: {
  articleSelector: string;
  /** False while no player can run (e.g. speech unsupported): nothing shows. */
  enabled: boolean;
  onSelect: (block: number) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  /** The block element the current anchor belongs to (skips recomputing). */
  const blockElRef = useRef<Element | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };
  const hide = () => {
    cancelHide();
    blockElRef.current = null;
    setAnchor(null);
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = setTimeout(hide, HIDE_DELAY_MS);
  };

  useEffect(() => {
    if (!enabled) return;

    /** Anchor the button to the block containing `target`; false if none. */
    const show = (target: EventTarget | null): boolean => {
      const root = document.querySelector(articleSelector);
      if (!root || !(target instanceof Node) || !root.contains(target)) return false;
      if (blockElRef.current?.contains(target) && blockElRef.current.isConnected) return true;
      const blocks = extractLessonBlocks(root);
      const block = blocks.findIndex((b) => b.element.contains(target));
      if (block === -1) return false;
      const el = blocks[block].element;
      const rect = el.getBoundingClientRect();
      blockElRef.current = el;
      setAnchor({
        block,
        top: rect.top + window.scrollY,
        left: Math.max(4, rect.left + window.scrollX - BUTTON_OFFSET),
      });
      return true;
    };

    const inButton = (t: EventTarget | null) =>
      t instanceof Node && buttonRef.current?.contains(t) === true;

    const onPointerOver = (e: PointerEvent) => {
      // Touch has no hover (it taps instead); a held button is a drag or a
      // text selection in progress — don't flash buttons under it.
      if (e.pointerType === 'touch' || (e.buttons ?? 0) !== 0) return;
      if (inButton(e.target)) return cancelHide();
      if (show(e.target)) cancelHide();
      else scheduleHide();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (inButton(e.target)) return;
      // A tap on a paragraph reveals its button (touch); anywhere else, or
      // a tap elsewhere, dismisses it. The tap itself is left untouched.
      if (!show(e.target)) hide();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', hide);
      cancelHide();
      blockElRef.current = null;
      setAnchor(null);
    };
    // hide/cancelHide/scheduleHide only touch refs and a state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, articleSelector]);

  if (!enabled || !anchor || typeof document === 'undefined') return null;

  return createPortal(
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        const { block } = anchor;
        hide();
        onSelect(block);
      }}
      onPointerEnter={cancelHide}
      onPointerLeave={scheduleHide}
      aria-label="Read aloud from this paragraph"
      title="Read aloud from here"
      style={{ position: 'absolute', top: anchor.top, left: anchor.left }}
      className="z-30 flex h-7 w-7 items-center justify-center rounded-full border border-stone-200/80 bg-white text-stone-500 shadow-soft transition-colors hover:border-accent-300 hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 active:translate-y-px dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:border-accent-800 dark:hover:text-accent-300 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 print:hidden"
    >
      <Icon name="play" className="h-3 w-3" />
    </button>,
    document.body,
  );
}
