import { useSyncExternalStore } from 'react';
import { Icon } from './ui/Icon';
import type { PlaybackShare, PlaybackStatus } from '../lib/playback-share';

/**
 * Floating pause/play button for lesson narration.
 *
 * Fixed to the viewport (bottom-right) so it stays reachable while the
 * learner scrolls. It shares playback state with the lesson player through
 * `share`: the status it shows is the player's status, and tapping it
 * drives the player's own toggle — both controls always agree, whether the
 * neural audio or the browser-voice fallback is active.
 *
 * Rendered only when narration is available for the lesson (`visible`);
 * `LessonNarrator` applies the same support gating as the main player.
 */
export function FloatingPlaybackButton({
  share,
  visible,
}: {
  share: PlaybackShare;
  visible: boolean;
}) {
  // Server snapshot: prerender output always shows the idle button; the
  // client hydrates to the live status on mount.
  const status: PlaybackStatus = useSyncExternalStore(
    share.subscribe,
    share.getStatus,
    () => 'idle' as PlaybackStatus,
  );

  if (!visible) return null;

  const playing = status === 'playing';
  // Same vocabulary as the main player (the Web Speech fallback's trio):
  // both controls name the same toggle the same way, and "listening"
  // covers the neural and fallback paths alike.
  const label = playing
    ? 'Pause listening'
    : status === 'paused'
      ? 'Resume listening'
      : 'Listen to this lesson';

  return (
    <button
      type="button"
      onClick={() => share.toggle()}
      aria-label={label}
      aria-pressed={playing}
      title={label}
      // Fixed bottom-right, stacked ABOVE the course Q&A button (fixed
      // bottom-5 right-5, h-14, z-50): sharing the corner would leave this
      // button unclickable underneath it. bottom-24 clears the Q&A
      // button's 76px top edge with room to spare.
      //
      // No aria-live region here: the main player's live region already
      // announces status changes — a second one would double-announce
      // every toggle. The aria-label flip covers the focused control.
      className="fixed bottom-24 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-stone-200/80 bg-white text-stone-600 shadow-lift transition-all hover:border-accent-300 hover:text-accent-800 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 active:translate-y-px dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-accent-800 dark:hover:text-accent-300"
    >
      <Icon name={playing ? 'pause' : 'play'} className="h-5 w-5" />
    </button>
  );
}
