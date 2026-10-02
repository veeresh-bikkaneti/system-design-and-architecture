import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Last Listen position per lesson: the block index (see `lib/listen-seek.ts`)
 * the learner had reached, so "Continue from where you left off" can resume.
 *
 * Local-only on purpose — it is a convenience, not progress: it is not part
 * of the gist sync and never gates anything. Index 0 is "the start", so it is
 * never stored (setting it clears the entry).
 *
 * Persisted under `sdm-listen-position` with a schema `version`; storage can
 * hold anything (older builds, hand edits, quota-truncated JSON), so every
 * load is rebuilt from scratch by `sanitizePositions` rather than trusted.
 */

export const LISTEN_POSITION_VERSION = 1;

/**
 * Cap on remembered lessons. The course is far smaller; this only bounds
 * what hostile or corrupt storage can make us hold.
 */
export const MAX_TRACKED_LESSONS = 500;

export type PositionMap = Record<string, number>;

const isBlockIndex = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;

/** Rebuild a position map from untrusted data, dropping anything invalid. */
export function sanitizePositions(raw: unknown): PositionMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter(([slug, index]) => slug.length > 0 && isBlockIndex(index))
    .slice(0, MAX_TRACKED_LESSONS) as Array<[string, number]>;
  // fromEntries defines own properties, so a "__proto__" key stays inert data.
  return Object.fromEntries(entries);
}

/** Saved block for `slug`; own keys only, so "constructor" is not a lesson. */
export function positionFor(map: PositionMap, slug: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(map, slug) && isBlockIndex(map[slug])
    ? map[slug]
    : undefined;
}

/**
 * Map with `slug` set to `index`. Returns the same object when nothing
 * changes (so callers can skip a pointless persist) and clears the entry
 * for a non-positive or invalid index.
 */
export function withPosition(map: PositionMap, slug: string, index: number): PositionMap {
  if (!isBlockIndex(index)) return withoutPosition(map, slug);
  if (positionFor(map, slug) === index) return map;
  const next: PositionMap = { ...map, [slug]: index };
  const slugs = Object.keys(next);
  if (slugs.length > MAX_TRACKED_LESSONS) {
    // Evict the oldest-inserted entry that isn't the one just written.
    const oldest = slugs.find((s) => s !== slug);
    if (oldest !== undefined) delete next[oldest];
  }
  return next;
}

/** Map without `slug`; the same object when it wasn't present. */
export function withoutPosition(map: PositionMap, slug: string): PositionMap {
  if (!Object.prototype.hasOwnProperty.call(map, slug)) return map;
  const next = { ...map };
  delete next[slug];
  return next;
}

export interface ListenPositionState {
  positions: PositionMap;
  setPosition: (slug: string, index: number) => void;
  clearPosition: (slug: string) => void;
}

export const useListenPositionStore = create<ListenPositionState>()(
  persist(
    (set, get) => ({
      positions: {},

      // persist() writes storage on every set(), even for an unchanged
      // state, so the no-op check happens here, before set().
      setPosition: (slug, index) => {
        const positions = withPosition(get().positions, slug, index);
        if (positions !== get().positions) set({ positions });
      },

      clearPosition: (slug) => {
        const positions = withoutPosition(get().positions, slug);
        if (positions !== get().positions) set({ positions });
      },
    }),
    {
      name: 'sdm-listen-position',
      version: LISTEN_POSITION_VERSION,
      partialize: (state) => ({ positions: state.positions }),
      // Future schema bumps migrate here; today every version funnels through
      // the sanitizer, which also rescues unversioned / hand-edited data.
      migrate: (persisted) => ({
        positions: sanitizePositions((persisted as { positions?: unknown } | null)?.positions),
      }),
      // Runs for same-version data too: a matching version number is not a
      // promise that the shape inside is sound.
      merge: (persisted, current) => ({
        ...current,
        positions: sanitizePositions((persisted as { positions?: unknown } | null)?.positions),
      }),
    },
  ),
);
