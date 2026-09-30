import { NARRATION_INDEX } from './narration-index.generated';
import type { NarrationAccent } from './narration';

/**
 * Key format for the build-time narration index: "<slug>/<accent>".
 * Matches what scripts/tts/generate_narration_index.py emits.
 */
export function narrationIndexKey(slug: string, accent: NarrationAccent): string {
  return `${slug}/${accent}`;
}

/**
 * Synchronous has-narration check, consulted on lesson mount.
 *
 * When true, the player fetches the manifest lazily on the first Listen
 * press (hover/focus prefetches). When false, the lesson/accent has no
 * build-time narration — the player renders the browser-voice fallback
 * and never probes the network at all (no wasted 404s).
 */
export function hasNarration(slug: string, accent: NarrationAccent): boolean {
  return NARRATION_INDEX.has(narrationIndexKey(slug, accent));
}
