import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './diagrams.css';
import { useDiagramEntrance } from './useDiagramEntrance';

/**
 * Props for {@link HashRingPlayground}.
 */
export interface HashRingPlaygroundProps {
  /** Servers on the ring at first. Defaults to 4. */
  defaultNodes?: number;
  /** Dots (keys) scattered on the ring. Defaults to 48. */
  keyCount?: number;
}

const MIN_NODES = 2;
const MAX_NODES = 8;

const NODE_COLORS = [
  '#d97706', // amber
  '#059669', // emerald
  '#0284c7', // sky
  '#7c3aed', // violet
  '#e11d48', // rose
  '#0891b2', // cyan
  '#ea580c', // orange
  '#65a30d', // lime
];

const SIZE = 400;
const CENTER = SIZE / 2;
const NODE_RING_R = 140;
const KEY_RING_R = 112;

/** Deterministic spread of points around the ring (golden angle) — same layout every load. */
function spreadAngle(i: number, offset: number): number {
  return (i * 137.508 + offset) % 360;
}

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

interface PlacedKey {
  id: number;
  angle: number;
  owner: number; // index into active nodes
  x: number;
  y: number;
}

/**
 * Interactive consistent-hashing ring for MDX lessons. Keys (dots) walk
 * clockwise around the ring until they bump into a server — that server owns
 * them. Add or remove a server and watch only the neighbor's keys move; the
 * rest of the ring doesn't flinch. That's the whole payoff of consistent
 * hashing, and you can see it instead of taking the lesson's word for it.
 *
 * Key dots glide to their new homes with Motion; with
 * `prefers-reduced-motion` they teleport instantly instead.
 *
 * @example
 * ```mdx
 * <HashRingPlayground />
 * ```
 */
export function HashRingPlayground({ defaultNodes = 4, keyCount = 48 }: HashRingPlaygroundProps) {
  const [nodeCount, setNodeCount] = useState(() =>
    Math.min(Math.max(defaultNodes, MIN_NODES), MAX_NODES),
  );
  const reduceMotion = useReducedMotion();
  const entrance = useDiagramEntrance();

  const nodes = useMemo(() => {
    const all = Array.from({ length: MAX_NODES }, (_, i) => ({
      id: i + 1,
      angle: spreadAngle(i, 0),
      color: NODE_COLORS[i],
    }));
    return all.slice(0, nodeCount).sort((a, b) => a.angle - b.angle);
  }, [nodeCount]);

  const keys: PlacedKey[] = useMemo(() => {
    const sortedAngles = nodes.map((n) => n.angle);
    return Array.from({ length: keyCount }, (_, k) => {
      const angle = spreadAngle(k, 31);
      let owner = sortedAngles.findIndex((a) => a >= angle);
      if (owner === -1) owner = 0; // wrap around the top of the ring
      const { x, y } = polar(angle, KEY_RING_R);
      return { id: k, angle, owner, x, y };
    });
  }, [nodes, keyCount]);

  // How many keys changed owner vs. before the last add/remove — the money
  // stat. Computed in an effect (never during render) so StrictMode's
  // double-render can't corrupt the baseline, and the last action lives in
  // state so render never touches a ref.
  const baselineOwners = useRef<number[]>([]);
  const pendingAction = useRef<'added' | 'removed' | null>(null);
  const [rebalance, setRebalance] = useState<{ action: 'added' | 'removed'; moved: number } | null>(
    null,
  );

  const ownersOf = (ks: PlacedKey[], ns: { id: number }[]) => ks.map((k) => ns[k.owner].id);

  useEffect(() => {
    if (pendingAction.current === null) return;
    const action = pendingAction.current;
    pendingAction.current = null;
    const now = ownersOf(keys, nodes);
    let n = 0;
    for (let i = 0; i < now.length; i++) if (now[i] !== baselineOwners.current[i]) n++;
    setRebalance({ action, moved: n });
  }, [keys, nodes]);

  const counts = useMemo(() => {
    const c = new Array(nodes.length).fill(0);
    for (const k of keys) c[k.owner]++;
    return c as number[];
  }, [keys, nodes]);

  const changeCount = (d: number) => {
    const next = Math.min(Math.max(nodeCount + d, MIN_NODES), MAX_NODES);
    if (next === nodeCount) return;
    baselineOwners.current = ownersOf(keys, nodes);
    pendingAction.current = d > 0 ? 'added' : 'removed';
    setNodeCount(next);
  };

  const keyTransition = { duration: reduceMotion ? 0 : 0.7, ease: 'easeInOut' as const };

  return (
    <motion.div
      className="not-prose diagram-panel my-8 rounded-xl border border-stone-200 bg-stone-50 p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950"
      {...entrance}
    >
      <h4 className="diagram-mono mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
        Consistent hashing, live
      </h4>
      <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        Every dot is a key. Each key walks clockwise around the ring until it bumps into a server —
        that server owns it. Now add or remove a server and watch: only the keys touching the change
        move. Everything else stays exactly where it was.
      </p>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto block w-full max-w-md"
        role="img"
        aria-label={`Consistent hashing ring with ${nodeCount} servers and ${keyCount} keys`}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={NODE_RING_R}
          fill="none"
          className="stroke-stone-300 dark:stroke-slate-700"
          strokeWidth={2}
          strokeDasharray="6 6"
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={KEY_RING_R}
          fill="none"
          className="stroke-stone-200 dark:stroke-slate-800"
          strokeWidth={1}
        />
        {keys.map((k) => (
          <motion.circle
            key={k.id}
            r={5}
            fill={nodes[k.owner].color}
            fillOpacity={0.75}
            initial={false}
            animate={{ cx: k.x, cy: k.y }}
            transition={keyTransition}
          />
        ))}
        {nodes.map((n) => {
          const p = polar(n.angle, NODE_RING_R);
          const lp = polar(n.angle, NODE_RING_R + 30);
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={15}
                fill={n.color}
                className="stroke-white dark:stroke-slate-950"
                strokeWidth={2.5}
              />
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={700}
                fill="#ffffff"
                className="diagram-mono"
              >
                {n.id}
              </text>
              <text
                x={lp.x}
                y={lp.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                className="diagram-mono fill-stone-500 dark:fill-slate-400"
              >
                {counts[nodes.indexOf(n)]} keys
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => changeCount(-1)}
          disabled={nodeCount <= MIN_NODES}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          − Remove server
        </button>
        <span
          aria-live="polite"
          className="diagram-mono text-xs font-semibold text-stone-600 dark:text-slate-300"
        >
          {nodeCount} servers · {keyCount} keys
        </span>
        <button
          type="button"
          onClick={() => changeCount(1)}
          disabled={nodeCount >= MAX_NODES}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          + Add server
        </button>
      </div>

      <p
        aria-live="polite"
        className="mt-4 rounded-lg bg-amber-100/70 px-4 py-3 text-sm font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
      >
        {rebalance === null ? (
          <>
            {keyCount} keys spread across {nodeCount} servers. Press “Add server” — count how many
            dots actually move.
          </>
        ) : rebalance.moved === 0 ? (
          <>No keys moved. (Try adding or removing a server to see the ring rebalance.)</>
        ) : (
          <>
            {rebalance.action === 'added' ? 'Added' : 'Removed'} a server →{' '}
            <strong>
              {rebalance.moved} of {keyCount} keys moved (
              {Math.round((rebalance.moved / keyCount) * 100)}%)
            </strong>
            . The other {keyCount - rebalance.moved} stayed exactly where they were — that's the
            whole point of the ring.
          </>
        )}
      </p>
    </motion.div>
  );
}
