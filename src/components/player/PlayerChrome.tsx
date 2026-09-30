import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from '../ui/Icon';

/**
 * Shared player chrome for the lesson listen players.
 *
 * `ListenButton` (browser speech-synthesis fallback) and `NeuralPlayer`
 * (build-time AI narration) are different playback engines behind one
 * visual control: the header pill, the options chevron, the dismissible
 * options popover, the speed segments. This module owns that chrome so the
 * two players can't drift apart — one recipe for the pill, one for the
 * segments, one dismiss behavior, one contrast-checked label style.
 */

/** Playback speeds offered by every listen player. */
export const SPEEDS = [0.9, 1, 1.25, 1.5] as const;

/**
 * Pill recipe for the header listen control — a secondary header action.
 * Same recipe as ShareButtons.
 */
export const pillClass =
  'inline-flex items-center gap-1.5 border border-stone-200/80 bg-white px-3.5 py-2 text-sm font-semibold text-stone-600 shadow-soft transition-colors hover:border-accent-300 hover:text-accent-800 active:translate-y-px dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-accent-800 dark:hover:text-accent-300';

/** Segmented option button (speed / voice choices inside the popover). */
export const segmentClass = (active: boolean) =>
  `rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
    active
      ? 'bg-accent-700 text-white dark:bg-accent-400 dark:text-stone-950'
      : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'
  }`;

/**
 * Dismiss-on-outside-click / Escape for an options popover. Subscribes only
 * while `open`. The close callback is read through a ref, so callers can
 * pass an inline closure without resubscribing on every render.
 */
export function usePopoverDismiss(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, panelRef]);
}

/**
 * Section heading inside a player options popover.
 * stone-500 on white (light) and stone-400 on stone-900 (dark) both clear
 * WCAG AA (≥ 4.5:1).
 */
export function PopoverLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
      {children}
    </p>
  );
}

/**
 * Explanatory note inside a player options popover.
 * stone-500 on white (light) and stone-400 on stone-900 (dark) both clear
 * WCAG AA (≥ 4.5:1).
 */
export function PopoverNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
      {children}
    </p>
  );
}

/** Speed selector rendered as a segmented group inside the popover. */
export function SpeedSegments({
  speed,
  onSelect,
}: {
  speed: number;
  onSelect: (speed: number) => void;
}) {
  return (
    <>
      <PopoverLabel>Speed</PopoverLabel>
      <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSelect(s)}
            aria-pressed={speed === s}
            className={segmentClass(speed === s)}
          >
            {s}×
          </button>
        ))}
      </div>
    </>
  );
}

export interface PlayerChromeProps {
  /** Accessible label for the play/pause pill. */
  playLabel: string;
  /** Visible text on the play/pause pill ("Listen", "Listening…", …). */
  playText: string;
  /** True while audio is playing (controls the icon + aria-pressed). */
  playing: boolean;
  onToggle: () => void;
  /** Accessible label for the options chevron button. */
  optionsLabel: string;
  /** Accessible label for the popover dialog. */
  popoverLabel: string;
  /** Width class for the popover panel (players differ slightly). */
  popoverWidthClass?: string;
  /** Screen-reader-only live-region text describing playback status. */
  statusText: string;
  /** Popover body: option sections and notes. */
  children: ReactNode;
}

/**
 * The shared pill shell: play/pause pill + options chevron + dismissible
 * options popover + screen-reader live region. Both listen players render
 * this; only the engine behind `onToggle` and the popover contents differ.
 */
export function PlayerChrome({
  playLabel,
  playText,
  playing,
  onToggle,
  optionsLabel,
  popoverLabel,
  popoverWidthClass = 'w-64',
  statusText,
  children,
}: PlayerChromeProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  usePopoverDismiss(optionsOpen, panelRef, () => setOptionsOpen(false));

  return (
    <div ref={panelRef} className="relative inline-flex items-stretch">
      <div className="inline-flex overflow-hidden rounded-full">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playLabel}
          aria-pressed={playing}
          className={`${pillClass} rounded-r-none border-r-0 pr-3`}
        >
          <Icon name={playing ? 'pause' : 'play'} className="h-4 w-4" />
          {playText}
        </button>
        <button
          type="button"
          onClick={() => setOptionsOpen((o) => !o)}
          aria-expanded={optionsOpen}
          aria-label={optionsLabel}
          className={`${pillClass} rounded-l-none px-2.5`}
        >
          <Icon name="chevronDown" className="h-4 w-4" />
        </button>
      </div>

      {optionsOpen && (
        <div
          role="dialog"
          aria-label={popoverLabel}
          className={`absolute right-0 top-full z-30 mt-2 ${popoverWidthClass} rounded-2xl border border-stone-200/80 bg-white p-4 shadow-lift dark:border-stone-700 dark:bg-stone-900`}
        >
          {children}
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {statusText}
      </span>
    </div>
  );
}
