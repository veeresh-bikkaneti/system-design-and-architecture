import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './diagrams.css';
import { useDiagramEntrance } from './useDiagramEntrance';

/**
 * Props for {@link CacheFlow}.
 */
export interface CacheFlowProps {
  /**
   * Heading rendered above the diagram.
   * Defaults to `"Cache-aside in motion"`.
   */
  title?: string;
}

type CacheNodeId = 'app' | 'cache' | 'db';

/** One animated hop between two nodes in a cache scenario. */
interface CacheLeg {
  /** Node the request dot starts from. */
  from: CacheNodeId;
  /** Node the request dot travels to. */
  to: CacheNodeId;
  /** Short label for the hop, e.g. `"GET user:42"`. */
  label: string;
  /** One-sentence explanation shown in the caption. */
  note: string;
}

/** A scripted cache scenario: a tab plus its legs and closing takeaway. */
interface CacheMode {
  id: string;
  tab: string;
  legs: CacheLeg[];
  endNote: string;
}

const MODES: CacheMode[] = [
  {
    id: 'read-hit',
    tab: 'Read · hit',
    legs: [
      {
        from: 'app',
        to: 'cache',
        label: 'GET user:42',
        note: 'The app checks Redis before touching the database.',
      },
      {
        from: 'cache',
        to: 'app',
        label: 'HIT — row in ~1 ms',
        note: 'The row is in memory, so no database round trip happens.',
      },
    ],
    endNote: 'The happy path — design so this is 90%+ of reads.',
  },
  {
    id: 'read-miss',
    tab: 'Read · miss',
    legs: [
      {
        from: 'app',
        to: 'cache',
        label: 'GET user:42',
        note: 'The app checks Redis first, as always.',
      },
      {
        from: 'cache',
        to: 'app',
        label: 'MISS',
        note: 'The key is absent — a cold cache after a deploy, or an expired TTL.',
      },
      {
        from: 'app',
        to: 'db',
        label: 'SELECT * FROM users WHERE id=42',
        note: 'On a miss the app falls back to the database.',
      },
      {
        from: 'db',
        to: 'app',
        label: 'row (~40 ms)',
        note: 'The database answers — roughly 40× slower than a cache hit.',
      },
      {
        from: 'app',
        to: 'cache',
        label: 'SET user:42 · TTL 300s',
        note: 'The app warms the cache so the next read is a hit.',
      },
    ],
    endNote: 'The first request after a deploy hammers the DB — the thundering herd.',
  },
  {
    id: 'write-through',
    tab: 'Write-through',
    legs: [
      {
        from: 'app',
        to: 'cache',
        label: 'SET user:42',
        note: 'Every write lands in the cache first.',
      },
      {
        from: 'cache',
        to: 'db',
        label: 'write — synchronous',
        note: 'The cache blocks while the database confirms the write.',
      },
      {
        from: 'db',
        to: 'cache',
        label: 'ack',
        note: 'The database confirms the write is durable.',
      },
      {
        from: 'cache',
        to: 'app',
        label: 'ack',
        note: 'Only now does the app get its acknowledgement.',
      },
    ],
    endNote: 'Slow writes, but cache and DB never disagree.',
  },
  {
    id: 'write-back',
    tab: 'Write-back',
    legs: [
      {
        from: 'app',
        to: 'cache',
        label: 'SET user:42',
        note: 'The write lands in memory only.',
      },
      {
        from: 'cache',
        to: 'app',
        label: 'ack in ~1 ms — marked dirty',
        note: 'The app is free immediately; the key is flagged dirty.',
      },
      {
        from: 'cache',
        to: 'db',
        label: 'flush dirty keys (async)',
        note: 'Dirty keys flush to the database in the background.',
      },
    ],
    endNote: 'Fast writes; a crash before the flush loses data.',
  },
];

const VIEW_W = 660;
const VIEW_H = 260;
const NODE_W = 120;
const NODE_H = 46;
const MID_Y = 130;

const CENTERS: Record<CacheNodeId, { x: number; y: number }> = {
  app: { x: 110, y: MID_Y },
  cache: { x: 330, y: MID_Y },
  db: { x: 550, y: MID_Y },
};

const LEG_MS = 1800;
const DOT_S = 0.7;

const BTN =
  'rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800';

const tabClass = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? 'border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-400 dark:bg-amber-950/60 dark:text-amber-100'
      : 'border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'
  }`;

/** True when the site-wide calm-motion setting is on (`data-motion="calm"` on <html>). */
function isCalmMotion(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.dataset.motion === 'calm'
  );
}

/**
 * Animated cache-aside diagram for MDX lessons. Four tabbed scenarios —
 * read hit, read miss, write-through, write-back — each scripted as a
 * sequence of request legs. A dot travels between the App, Cache, and
 * Database nodes while the caption narrates each hop; step dots and
 * Prev/Next buttons allow manual control, and autoplay pauses under
 * reduced or calm motion.
 *
 * @example
 * ```mdx
 * <CacheFlow />
 * <CacheFlow title="Read path, animated" />
 * ```
 */
export function CacheFlow({ title = 'Cache-aside in motion' }: CacheFlowProps) {
  // Scroll-triggered entrance shared with every other diagram component —
  // see useDiagramEntrance.
  const entrance = useDiagramEntrance();
  const reduceMotion = useReducedMotion();
  const [modeIdx, setModeIdx] = useState(0);
  const [legIdx, setLegIdx] = useState(0);
  const [playing, setPlaying] = useState(() => !isCalmMotion());

  const calm = reduceMotion || isCalmMotion();
  const mode = MODES[modeIdx];
  const leg = mode.legs[legIdx];
  const lastIdx = mode.legs.length - 1;
  const isLastLeg = legIdx === lastIdx;

  // Auto-advance one leg at a time; never autoplay under reduced/calm
  // motion, and stop on the final leg.
  useEffect(() => {
    if (!playing || calm || isLastLeg) {
      if (playing && isLastLeg) setPlaying(false);
      return;
    }
    const t = setTimeout(() => {
      setLegIdx((i) => {
        const next = Math.min(i + 1, lastIdx);
        if (next === lastIdx) setPlaying(false);
        return next;
      });
    }, LEG_MS);
    return () => clearTimeout(t);
  }, [playing, calm, isLastLeg, lastIdx]);

  const goTo = (i: number) => setLegIdx(Math.min(Math.max(i, 0), lastIdx));
  const selectMode = (i: number) => {
    setModeIdx(i);
    setLegIdx(0);
  };

  // The request dot travels center-to-center. App<->DB legs arc over the
  // cache node so the fallback path reads as a distinct route.
  const fromC = CENTERS[leg.from];
  const toC = CENTERS[leg.to];
  const crosses =
    (leg.from === 'app' && leg.to === 'db') ||
    (leg.from === 'db' && leg.to === 'app');
  const via = crosses
    ? { x: 330, y: 88 }
    : { x: (fromC.x + toC.x) / 2, y: (fromC.y + toC.y) / 2 };

  const involves = (a: CacheNodeId, b: CacheNodeId) =>
    (leg.from === a && leg.to === b) || (leg.from === b && leg.to === a);
  const edgeClass = (active: boolean) =>
    active
      ? 'stroke-amber-500 dark:stroke-amber-400'
      : 'stroke-stone-300 dark:stroke-stone-600';

  // Badges: "warm" once a miss has repopulated the cache; "dirty" while a
  // write-back key awaits its async flush.
  const showWarm = mode.id === 'read-miss' && isLastLeg;
  const showDirty = mode.id === 'write-back' && legIdx === 1;
  const showBadge = showWarm || showDirty;

  return (
    <motion.div
      className="not-prose diagram-panel my-8 rounded-xl border border-stone-200 bg-stone-50 p-5 shadow-soft dark:border-stone-800 dark:bg-stone-950"
      {...entrance}
    >
      <h4 className="diagram-mono mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
        {title}
      </h4>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Cache scenario">
        {MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={i === modeIdx}
            onClick={() => selectMode(i)}
            className={tabClass(i === modeIdx)}
          >
            {m.tab}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="mx-auto block w-full max-w-2xl"
          role="img"
          aria-label={`${title}: ${mode.tab}, leg ${legIdx + 1} of ${mode.legs.length}: ${leg.label}`}
        >
          {/* Edges */}
          <line
            x1={CENTERS.app.x + NODE_W / 2}
            y1={MID_Y}
            x2={CENTERS.cache.x - NODE_W / 2}
            y2={MID_Y}
            className={edgeClass(involves('app', 'cache'))}
            strokeWidth={involves('app', 'cache') ? 2.5 : 2}
          />
          <line
            x1={CENTERS.cache.x + NODE_W / 2}
            y1={MID_Y}
            x2={CENTERS.db.x - NODE_W / 2}
            y2={MID_Y}
            className={edgeClass(involves('cache', 'db'))}
            strokeWidth={involves('cache', 'db') ? 2.5 : 2}
          />
          {mode.id === 'read-miss' && (
            <path
              d={`M ${CENTERS.app.x + NODE_W / 2} ${MID_Y} Q 330 52 ${CENTERS.db.x - NODE_W / 2} ${MID_Y}`}
              fill="none"
              strokeDasharray="5 4"
              className={edgeClass(involves('app', 'db'))}
              strokeWidth={involves('app', 'db') ? 2.5 : 1.5}
            />
          )}

          {/* Nodes: App (client, cyan), Cache (infra, amber), DB (data, violet) */}
          <g>
            <rect
              x={CENTERS.app.x - NODE_W / 2}
              y={MID_Y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={9}
              strokeWidth={1.5}
              className="fill-cyan-50 stroke-cyan-600 dark:fill-cyan-950/60 dark:stroke-cyan-400"
            />
            <text
              x={CENTERS.app.x}
              y={MID_Y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              className="diagram-mono fill-cyan-950 dark:fill-cyan-100"
            >
              App
            </text>
          </g>
          <g>
            <rect
              x={CENTERS.cache.x - NODE_W / 2}
              y={MID_Y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={9}
              strokeWidth={1.5}
              className="fill-amber-50 stroke-amber-500 dark:fill-amber-950/60 dark:stroke-amber-400"
            />
            <text
              x={CENTERS.cache.x}
              y={MID_Y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              className="diagram-mono fill-amber-950 dark:fill-amber-100"
            >
              Cache · Redis
            </text>
          </g>
          <g>
            <rect
              x={CENTERS.db.x - NODE_W / 2}
              y={MID_Y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={9}
              strokeWidth={1.5}
              className="fill-violet-50 stroke-violet-500 dark:fill-violet-950/60 dark:stroke-violet-400"
            />
            <text
              x={CENTERS.db.x}
              y={MID_Y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              className="diagram-mono fill-violet-950 dark:fill-violet-100"
            >
              Database
            </text>
          </g>

          {/* Warm/dirty badge above the cache node */}
          {showBadge && (
            <g>
              <rect
                x={CENTERS.cache.x - 34}
                y={76}
                width={68}
                height={20}
                rx={10}
                strokeWidth={1.5}
                className={
                  showDirty
                    ? 'fill-rose-100 stroke-rose-500 dark:fill-rose-950/60 dark:stroke-rose-400'
                    : 'fill-emerald-100 stroke-emerald-500 dark:fill-emerald-950/60 dark:stroke-emerald-400'
                }
              />
              <text
                x={CENTERS.cache.x}
                y={86}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fontWeight={700}
                className={
                  showDirty
                    ? 'diagram-mono fill-rose-950 dark:fill-rose-100'
                    : 'diagram-mono fill-emerald-950 dark:fill-emerald-100'
                }
              >
                {showDirty ? 'dirty' : 'warm'}
              </text>
            </g>
          )}

          {/* Traveling request dot for the active leg */}
          <motion.circle
            key={`${mode.id}-${legIdx}`}
            r={7}
            className="fill-amber-500 dark:fill-amber-400"
            initial={{ cx: fromC.x, cy: fromC.y }}
            animate={{ cx: [fromC.x, via.x, toC.x], cy: [fromC.y, via.y, toC.y] }}
            transition={{ duration: DOT_S, ease: 'easeInOut', times: [0, 0.5, 1] }}
          />
        </svg>
      </div>

      {/* Caption */}
      <div aria-live="polite" className="mt-4 min-h-20">
        <p className="diagram-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
          Leg {legIdx + 1} of {mode.legs.length}
        </p>
        <p className="diagram-mono mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
          {leg.label}
        </p>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{leg.note}</p>
        {isLastLeg && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {mode.endNote}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!calm && (
            <button
              type="button"
              onClick={() => {
                if (isLastLeg && !playing) {
                  setLegIdx(0);
                  setPlaying(true);
                } else {
                  setPlaying((p) => !p);
                }
              }}
              className={BTN}
              aria-label={playing ? 'Pause animation' : 'Play animation'}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
          )}
          <button
            type="button"
            onClick={() => goTo(legIdx - 1)}
            disabled={legIdx === 0}
            className={BTN}
          >
            ← Prev
          </button>
        </div>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Legs">
          {mode.legs.map((l, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === legIdx}
              aria-label={`Go to leg ${i + 1}: ${l.label}`}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-[width] ${
                i === legIdx
                  ? 'w-6 bg-amber-500'
                  : 'w-2 bg-stone-300 hover:bg-stone-400 dark:bg-stone-700 dark:hover:bg-stone-600'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(legIdx + 1)}
          disabled={isLastLeg}
          className={BTN}
        >
          Next →
        </button>
      </div>
    </motion.div>
  );
}
