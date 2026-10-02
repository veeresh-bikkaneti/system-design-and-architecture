import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from '../ui/Icon';

/**
 * Shared player chrome for the lesson listen players.
 *
 * `ListenButton` (browser speech-synthesis fallback) and `NeuralPlayer`
 * (build-time AI narration) are different playback engines behind one
 * visual control: the header pill, the options chevron, the dismissible
 * options popover, the speed segments. This module owns that chrome so the
 * two players can't drift apart — one shared recipe for the pill, one for the
 * segments, one dismiss behavior, one contrast-checked label style
 * (this module covers the two listen players; ShareButtons reuses the same
 * pill recipe separately — see P1-12 notes).
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

/**
 * Paragraph-level transport shared by both engines. Pass it only while a
 * track is active (playing or paused); omit it when idle or when the engine
 * can't seek, and the chrome renders exactly as before.
 */
export interface PlayerSeekControls {
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * Icon-only transport button. Uses `aria-disabled` instead of `disabled` so
 * a learner stepping to the first/last paragraph keeps keyboard focus on
 * the button rather than losing it to <body>.
 */
function SeekButton({
  label,
  shortcut,
  icon,
  enabled,
  onClick,
  className,
}: {
  label: string;
  shortcut: 'ArrowLeft' | 'ArrowRight';
  icon: 'skipBack' | 'skipForward';
  enabled: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (enabled) onClick();
      }}
      aria-label={label}
      aria-disabled={!enabled}
      aria-keyshortcuts={shortcut}
      title={label}
      className={`${className} aria-disabled:cursor-not-allowed aria-disabled:opacity-40`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
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
  /** Previous/next paragraph controls; see {@link PlayerSeekControls}. */
  seek?: PlayerSeekControls;
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
  seek,
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
        {seek && (
          // Compact UI keeps the pill short: below `sm` these two live in
          // the options popover instead (same handlers, same labels).
          <>
            <SeekButton
              label="Previous paragraph"
              shortcut="ArrowLeft"
              icon="skipBack"
              enabled={seek.canPrev}
              onClick={seek.onPrev}
              className={`${pillClass} rounded-none border-r-0 px-2.5 max-sm:hidden`}
            />
            <SeekButton
              label="Next paragraph"
              shortcut="ArrowRight"
              icon="skipForward"
              enabled={seek.canNext}
              onClick={seek.onNext}
              className={`${pillClass} rounded-none border-r-0 px-2.5 max-sm:hidden`}
            />
          </>
        )}
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
          {seek && (
            <div className="mb-3 sm:hidden">
              <PopoverLabel>Paragraph</PopoverLabel>
              <div className="mt-1.5 flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (seek.canPrev) seek.onPrev();
                  }}
                  aria-label="Previous paragraph"
                  aria-disabled={!seek.canPrev}
                  className={`${segmentClass(false)} inline-flex items-center gap-1 border border-stone-200/80 aria-disabled:opacity-40 dark:border-stone-700`}
                >
                  <Icon name="skipBack" className="h-3.5 w-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (seek.canNext) seek.onNext();
                  }}
                  aria-label="Next paragraph"
                  aria-disabled={!seek.canNext}
                  className={`${segmentClass(false)} inline-flex items-center gap-1 border border-stone-200/80 aria-disabled:opacity-40 dark:border-stone-700`}
                >
                  Next
                  <Icon name="skipForward" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          {children}
          {seek && (
            <PopoverNote>
              Tip: press the left and right arrow keys to skip between paragraphs while listening.
            </PopoverNote>
          )}
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {statusText}
      </span>
    </div>
  );
}
