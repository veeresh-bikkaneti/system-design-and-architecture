import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchManifest,
  type NarrationAccent,
  type NarrationManifest,
} from '../lib/narration';
import { hasNarration } from '../lib/narration-index';

/** Lazy manifest-probe lifecycle: idle until the learner asks for audio. */
export type NarrationProbeState = 'idle' | 'loading' | 'ready' | 'failed';

export interface NarrationProbe {
  /** Build-time index verdict: does this lesson+accent have narration? */
  narratable: boolean;
  state: NarrationProbeState;
  manifest: NarrationManifest | null;
  /**
   * True when the probe reached 'ready' because of a Listen press (not a
   * hover/focus prefetch) — the renderer hands this to the neural player
   * as a single auto-start. Cleared on slug/accent change.
   */
  autoplay: boolean;
  /**
   * Start the manifest fetch. `autoplay` begins playback the moment the
   * manifest lands (the Listen press); without it the fetch is a silent
   * prefetch (button hover/focus). Calls while a fetch is in flight only
   * flip the autoplay flag — the in-flight request is shared.
   */
  probe: (opts?: { autoplay?: boolean }) => void;
}

/**
 * Lazy narration probe.
 *
 * The build-time index (`hasNarration`) is consulted synchronously — when
 * it says the lesson/accent has no narration, this hook never touches the
 * network. Otherwise the manifest is fetched only when `probe()` is
 * called, i.e. on the first Listen press (with playback) or its
 * hover/focus prefetch (without).
 *
 * A generation counter drops stale resolutions when slug/accent changes
 * mid-flight, so an accent switch always re-probes the new accent cleanly.
 */
export function useNarrationProbe(
  slug: string,
  accent: NarrationAccent,
): NarrationProbe {
  const narratable = useMemo(() => hasNarration(slug, accent), [slug, accent]);
  const [state, setState] = useState<NarrationProbeState>('idle');
  const [manifest, setManifest] = useState<NarrationManifest | null>(null);
  const [autoplay, setAutoplay] = useState(false);

  /** Set by a Listen press; read when the fetch resolves. */
  const autoplayRef = useRef(false);
  /** Bumped on slug/accent change so stale resolutions are ignored. */
  const generationRef = useRef(0);

  // Fresh lesson or accent: drop everything — the next Listen press
  // probes the new target (and the index decides whether to probe at all).
  useEffect(() => {
    generationRef.current += 1;
    autoplayRef.current = false;
    setManifest(null);
    setAutoplay(false);
    setState('idle');
  }, [slug, accent]);

  const probe = useCallback(
    (opts?: { autoplay?: boolean }) => {
      if (!narratable || state === 'ready') return;
      if (opts?.autoplay) autoplayRef.current = true;
      if (state === 'loading') return; // share the in-flight request

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setState('loading');
      fetchManifest(slug, accent).then(
        (loaded) => {
          if (generationRef.current !== generation) return; // stale
          setManifest(loaded);
          setAutoplay(autoplayRef.current);
          autoplayRef.current = false;
          setState('ready');
        },
        () => {
          if (generationRef.current !== generation) return; // stale
          setState('failed');
        },
      );
    },
    [narratable, state, slug, accent],
  );

  return { narratable, state, manifest, autoplay, probe };
}
