import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './diagrams.css';
import { useDiagramEntrance } from './useDiagramEntrance';

/**
 * Load-balancing algorithm simulated by {@link LoadBalancerSim}.
 */
export type LbAlgorithm = 'round-robin' | 'least-connections' | 'weighted';

/**
 * Props for {@link LoadBalancerSim}.
 */
export interface LoadBalancerSimProps {
  /**
   * Heading rendered above the simulation. Defaults to
   * `"Watch the algorithms work"`.
   */
  title?: string;
}

interface ServerSpec {
  name: string;
  weight: number;
}

interface ServerLoad {
  active: number;
  served: number;
}

interface FlightDot {
  id: number;
  server: number;
}

const SERVERS: ServerSpec[] = [
  { name: 'api-1', weight: 2 },
  { name: 'api-2', weight: 1 },
  { name: 'api-3', weight: 1 },
];
const TOTAL_WEIGHT = SERVERS.reduce((sum, s) => sum + s.weight, 0);

const SPAWN_MS = 900;
const DOT_S = 0.6;
const MIN_LATENCY_MS = 1500;
const MAX_LATENCY_MS = 4000;
const MAX_DOTS = 24;
const VERDICT_AFTER = 10;

const VIEW_W = 660;
const VIEW_H = 300;
const LB_X = 28;
const LB_Y = 127;
const LB_W = 128;
const LB_H = 46;
const LB_CX = LB_X + LB_W / 2;
const LB_CY = LB_Y + LB_H / 2;
const SRV_X = 452;
const SRV_W = 160;
const srvCy = (i: number) => 62 + i * 88;

const ALGORITHMS: {
  id: LbAlgorithm;
  tab: string;
  caption: string;
  verdict: string;
}[] = [
  {
    id: 'round-robin',
    tab: 'Round robin',
    caption:
      'Round robin deals requests like cards — perfectly fair in count, blind to how busy each server is.',
    verdict:
      'Counts are even, but watch the load bars — a slow request still pins one server while RR keeps dealing.',
  },
  {
    id: 'least-connections',
    tab: 'Least connections',
    caption:
      'Least connections sends each request to the server with the fewest active — it watches real load.',
    verdict: 'Active load stays balanced even with uneven request costs.',
  },
  {
    id: 'weighted',
    tab: 'Weighted',
    caption:
      'Weighted round robin biases the deal toward api-1, the beefier box (weight 2).',
    verdict: 'api-1 absorbs roughly twice the traffic.',
  },
];

const btnClass =
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

const zeroLoads = (): ServerLoad[] => SERVERS.map(() => ({ active: 0, served: 0 }));

/**
 * Animated load-balancer simulation for MDX lessons. Requests spawn on a
 * timer, a dot travels from the load balancer to the chosen server, and each
 * server tracks its active requests as a load bar plus a served counter.
 * Tab between round robin, least connections, and weighted round robin to
 * feel how each algorithm distributes uneven work; after ten served requests
 * a verdict line summarizes the difference. Autoplay pauses under reduced or
 * calm motion, where "Send one request" steps the simulation manually.
 *
 * @example
 * ```mdx
 * <LoadBalancerSim />
 * <LoadBalancerSim title="Round robin vs least connections" />
 * ```
 */
export function LoadBalancerSim({
  title = 'Watch the algorithms work',
}: LoadBalancerSimProps) {
  // Scroll-triggered entrance shared with every other diagram component —
  // see useDiagramEntrance.
  const entrance = useDiagramEntrance();
  const reduceMotion = useReducedMotion();
  const calm = reduceMotion || isCalmMotion();

  const [algorithm, setAlgorithm] = useState<LbAlgorithm>('round-robin');
  const [playing, setPlaying] = useState(() => !isCalmMotion());
  const [loads, setLoads] = useState<ServerLoad[]>(zeroLoads);
  const [dots, setDots] = useState<FlightDot[]>([]);

  // Mutable simulation state lives in refs so timers always see the latest
  // values; the useState mirrors above exist only to trigger renders.
  const algoRef = useRef<LbAlgorithm>(algorithm);
  const loadRef = useRef<ServerLoad[]>(zeroLoads());
  const rrRef = useRef(0);
  const wrrRef = useRef<number[]>(SERVERS.map(() => 0));
  const nextDotId = useRef(1);
  const timersRef = useRef<number[]>([]);

  const spawnRequest = useCallback(() => {
    const load = loadRef.current;
    let idx: number;
    if (algoRef.current === 'round-robin') {
      idx = rrRef.current % SERVERS.length;
      rrRef.current += 1;
    } else if (algoRef.current === 'least-connections') {
      idx = 0;
      for (let i = 1; i < load.length; i++) {
        if (load[i].active < load[idx].active) idx = i;
      }
    } else {
      // Smooth weighted round robin (nginx-style): each pick adds the
      // server's weight to a running score and subtracts the total from
      // the winner, so api-1 (weight 2) wins twice per four-request cycle:
      // api-1, api-2, api-1, api-3.
      const cur = wrrRef.current;
      idx = 0;
      for (let i = 0; i < SERVERS.length; i++) {
        cur[i] += SERVERS[i].weight;
        if (cur[i] > cur[idx]) idx = i;
      }
      cur[idx] -= TOTAL_WEIGHT;
    }

    load[idx].active += 1;
    setLoads(load.map((s) => ({ ...s })));

    // The traveling dot is visual only and capped so the SVG never fills.
    const id = nextDotId.current++;
    setDots((prev) =>
      prev.length >= MAX_DOTS ? prev : [...prev, { id, server: idx }],
    );
    const remove = window.setTimeout(() => {
      setDots((prev) => prev.filter((d) => d.id !== id));
    }, DOT_S * 1000 + 150);
    timersRef.current.push(remove);

    // Each request holds its server for a random 1.5–4s, then completes.
    const latency =
      MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS);
    const done = window.setTimeout(() => {
      const s = loadRef.current[idx];
      s.active = Math.max(0, s.active - 1);
      s.served += 1;
      setLoads(loadRef.current.map((x) => ({ ...x })));
    }, latency);
    timersRef.current.push(done);
  }, []);

  // Spawn loop; never autoplay under reduced/calm motion.
  useEffect(() => {
    if (!playing || calm) return;
    const iv = window.setInterval(spawnRequest, SPAWN_MS);
    return () => window.clearInterval(iv);
  }, [playing, calm, spawnRequest]);

  // Clear pending completion timers on unmount.
  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    },
    [],
  );

  const reset = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    loadRef.current = zeroLoads();
    rrRef.current = 0;
    wrrRef.current = SERVERS.map(() => 0);
    setLoads(loadRef.current.map((s) => ({ ...s })));
    setDots([]);
    setPlaying(false);
  }, []);

  const selectAlgorithm = (id: LbAlgorithm) => {
    algoRef.current = id;
    setAlgorithm(id);
    reset();
  };

  const algo =
    ALGORITHMS.find((a) => a.id === algorithm) ?? ALGORITHMS[0];
  const totalServed = loads.reduce((sum, s) => sum + s.served, 0);
  const totalActive = loads.reduce((sum, s) => sum + s.active, 0);
  const totalSent = totalServed + totalActive;
  const showVerdict = totalServed >= VERDICT_AFTER;

  return (
    <motion.div
      className="not-prose diagram-panel my-8 rounded-xl border border-stone-200 bg-stone-50 p-5 shadow-soft dark:border-stone-800 dark:bg-stone-950"
      {...entrance}
    >
      <h4 className="diagram-mono mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
        {title}
      </h4>

      {/* Algorithm tabs */}
      <div
        className="mb-3 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Load balancing algorithm"
      >
        {ALGORITHMS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === algorithm}
            onClick={() => selectAlgorithm(a.id)}
            className={tabClass(a.id === algorithm)}
          >
            {a.tab}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
        {algo.caption}
      </p>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="mx-auto block w-full max-w-2xl"
          role="img"
          aria-label={`${title}: load balancer distributing requests across api-1, api-2 and api-3 using ${algo.tab}`}
        >
          {/* Edges: load balancer fans out to the servers */}
          {SERVERS.map((s, i) => (
            <line
              key={`e-${s.name}`}
              x1={LB_X + LB_W}
              y1={LB_CY}
              x2={SRV_X}
              y2={srvCy(i)}
              className="stroke-stone-300 dark:stroke-stone-600"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          ))}

          {/* Load balancer node: infra hop (amber) */}
          <g>
            <rect
              x={LB_X}
              y={LB_Y}
              width={LB_W}
              height={LB_H}
              rx={9}
              strokeWidth={1.5}
              className="fill-amber-50 stroke-amber-500 dark:fill-amber-950/60 dark:stroke-amber-400"
            />
            <text
              x={LB_CX}
              y={LB_CY}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              className="diagram-mono fill-amber-950 dark:fill-amber-100"
            >
              Load balancer
            </text>
          </g>

          {/* Server nodes: backend services (emerald), each with an
              active-request load bar and a served counter */}
          {SERVERS.map((s, i) => {
            const cy = srvCy(i);
            const segments = Math.min(loads[i].active, 10);
            return (
              <g key={s.name}>
                <rect
                  x={SRV_X}
                  y={cy - 30}
                  width={SRV_W}
                  height={60}
                  rx={9}
                  strokeWidth={1.5}
                  className="fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950/60 dark:stroke-emerald-400"
                />
                <text
                  x={SRV_X + SRV_W / 2}
                  y={cy - 15}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontWeight={600}
                  className="diagram-mono fill-emerald-950 dark:fill-emerald-100"
                >
                  {s.name}
                </text>
                <rect
                  x={SRV_X + 16}
                  y={cy - 3}
                  width={SRV_W - 32}
                  height={10}
                  rx={5}
                  className="fill-stone-200 dark:fill-stone-800"
                />
                {Array.from({ length: segments }, (_, k) => (
                  <rect
                    key={k}
                    x={SRV_X + 19 + k * 12.4}
                    y={cy - 1}
                    width={10}
                    height={6}
                    rx={3}
                    className="fill-emerald-500 dark:fill-emerald-400"
                  />
                ))}
                <text
                  x={SRV_X + 16}
                  y={cy + 20}
                  fontSize={10}
                  className="diagram-mono fill-stone-500 dark:fill-stone-400"
                >
                  served: {loads[i].served}
                </text>
              </g>
            );
          })}

          {/* Traveling request dots */}
          {dots.map((d) => (
            <motion.circle
              key={d.id}
              r={6}
              className="fill-amber-500 dark:fill-amber-400"
              initial={{ cx: LB_CX, cy: LB_CY }}
              animate={{ cx: SRV_X + 10, cy: srvCy(d.server) }}
              transition={{ duration: reduceMotion ? 0 : DOT_S, ease: 'easeIn' }}
            />
          ))}
        </svg>
      </div>
      <p className="diagram-mono mt-2 text-center text-[11px] text-stone-400 dark:text-stone-500">
        Load bar = active requests · served = completed requests
      </p>

      {/* Status + verdict */}
      <div aria-live="polite" className="mt-4 min-h-12">
        <p className="diagram-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
          {algo.tab} · sent {totalSent} · in flight {totalActive} · served{' '}
          {totalServed}
        </p>
        {showVerdict ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {algo.verdict}
          </p>
        ) : (
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            {totalSent === 0
              ? 'No requests yet — press Play or send one manually.'
              : `Serve ${VERDICT_AFTER} requests to see the verdict.`}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!calm && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className={btnClass}
            aria-pressed={playing}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
        )}
        <button type="button" onClick={reset} className={btnClass}>
          Reset
        </button>
        <button type="button" onClick={spawnRequest} className={btnClass}>
          Send one request
        </button>
      </div>
    </motion.div>
  );
}
