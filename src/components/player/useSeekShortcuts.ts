import { useEffect, useRef } from 'react';
import { seekKeyDelta, type SeekKeyEvent, type SeekKeyTarget } from '../../lib/listen-seek';

/**
 * ←/→ skip to the previous/next paragraph while a listen player is active
 * (playing or paused). Subscribes only while `active`, and reads `onStep`
 * through a ref so callers can pass an inline closure without resubscribing.
 *
 * Which keystrokes count — no modifiers, no auto-repeat, nothing aimed at an
 * input, slider or other control that owns the arrows — is decided by the
 * pure `seekKeyDelta`, so this hook is only the DOM subscription.
 */
export function useSeekShortcuts(
  active: boolean,
  onStep: (delta: -1 | 1) => void,
): void {
  const onStepRef = useRef(onStep);
  useEffect(() => {
    onStepRef.current = onStep;
  });

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // KeyboardEvent fields are prototype getters, so they can't be spread.
      const view: SeekKeyEvent = {
        key: e.key,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        repeat: e.repeat,
        isComposing: e.isComposing,
        defaultPrevented: e.defaultPrevented,
        target: e.target as SeekKeyTarget | null,
      };
      const delta = seekKeyDelta(view);
      if (delta === 0) return;
      e.preventDefault();
      onStepRef.current(delta);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
