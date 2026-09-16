import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './diagrams.css';
import { useDiagramEntrance } from './useDiagramEntrance';

/**
 * Rate-limiting window strategy compared by {@link SlidingWindowSim}.
 */
export type WindowMode = 'fixed' | 'sliding';

/**
 * Props for {@link SlidingWindowSim}.
 */
export interface SlidingWindowSimProps {
  /**
   * Heading rendered above the simulation. Defaults to
   * `"The boundary exploit: fixed vs sliding window"`.
   */
  title?: string;
}

interface PriorRequest {
  time: number;
  allowed: boolean;
}

interface EvalResult {
  allowed: boolean;
  count: number;
  windowLabel: string;
}

const LIMIT = 5;
const WINDOW_S = 10;
const TIMELINE_S = 20;
// A burst straddling the t=10 boundary, plus two late stragglers.
const TIMES = [8.9, 9.2, 9.5, 9.7, 9.9, 10.1, 10.3, 10.5, 10.7, 10.9, 19.9];
const SWEEP_S = 8;
const SPEED = TIMELINE_S / SWEEP_S;

const VIEW_W = 660;
const VIEW_H = 220;
const ML = 46;
const MR = 26;
const AXIS_Y = 148;
const BOX_Y = 66;
const BOX_H = 56;
const x = (t: number) => ML + (t / TIMELINE_S) * (VIEW_W - ML - MR);

const MODES: {
  id: WindowMode;
  tab: string;
  blurb: string;
  caption: string;
}[] = [
  {
    id: 'fixed',
    tab: 'Fixed window',
    blurb:
      'The counter resets at each 10-second boundary — a burst straddling the boundary slips straight through.',
    caption:
      "10 requests in 2 seconds, all 'within the limit' — the boundary exploit. Then a lone legitimate request at 19.9s gets 429'd: the window that waved the burst through punishes honest traffic.",
  },
  {
    id: 'sliding',
    tab: 'Sliding window',
    blurb:
      'Each request is judged against its own trailing 10 seconds — the burst has nowhere to hide.',
    caption:
      'Every request is judged against its trailing 10 seconds: the burst is stopped cold, and legitimate traffic at 19.9s flows.',
  },
];

/**
 * Decide one request under the active strategy.
 *
 * Fixed window counts every request already seen in the current 10-second
 * block `[0,10)` / `[10,20)` and allows while the count is under the limit.
 * Sliding window counts only *allowed* requests in the trailing
 * `(t-10, t]` interval — the ZADD + ZREMRANGEBYSCORE + ZCOUNT pattern.
 */
function evaluate(
  mode: WindowMode,
  t: number,
  prior: PriorRequest[],
): EvalResult {
  if (mode === 'fixed') {
    const block = Math.floor(t / WINDOW_S);
    const count = prior.filter(
      (r) => Math.floor(r.time / WINDOW_S) === block,
    ).length;
    return {
      allowed: count < LIMIT,
      count,
      windowLabel: `window [${block * WINDOW_S}, ${(block + 1) * WINDOW_S})`,
    };
  }
  const count = prior.filter(
    (r) => r.allowed && r.time > t - WINDOW_S,
  ).length;
  return {
    allowed: count < LIMIT,
    count,
    windowLabel: `trailing (${(t - WINDOW_S).toFixed(1)}, ${t.toFixed(1)}]`,
  };
}

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

/**
 * Animated rate-limiting comparison for MDX lessons. Twelve requests arrive
 * on a 0–20s timeline with a burst straddling the t=10 boundary; a cursor
 * sweeps the timeline on Play and each request is judged live. Fixed window
 * draws its two static 10-second blocks, sliding window draws one box that
 * follows the cursor. Accepted ticks glow emerald, rejected ones rose with a
 * 429 label, and an aria-live status narrates every decision. Autoplay
 * pauses under reduced or calm motion, where "Next request" steps the
 * simulation manually.
 *
 * @example
 * ```mdx
 * <SlidingWindowSim />
 * <SlidingWindowSim title="Why fixed windows leak" />
 * ```
 */
export function SlidingWindowSim({
  title = 'The boundary exploit: fixed vs sliding window',
}: SlidingWindowSimProps) {
  // Scroll-triggered entrance shared with every other diagram component —
  // see useDiagramEntrance.
  const entrance = useDiagramEntrance();
  const reduceMotion = useReducedMotion();
  const calm = reduceMotion || isCalmMotion();

  const [mode, setMode] = useState<WindowMode>('fixed');
  const [results, setResults] = useState<EvalResult[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(() => !isCalmMotion());

  // Refs mirror state for the animation loop and manual stepping.
  const modeRef = useRef<WindowMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const priorRef = useRef<PriorRequest[]>([]);
  const cursorRef = useRef(0);

  const evaluateNext = useCallback((t: number) => {
    const r = evaluate(modeRef.current, t, priorRef.current);
    priorRef.current = [...priorRef.current, { time: t, allowed: r.allowed }];
    setResults((prev) => [...prev, r]);
  }, []);

  // Cursor sweep; never autoplay under reduced/calm motion.
  useEffect(() => {
    if (!playing || calm) return;
    let raf = 0;
    let last = performance.now();
    let c = cursorRef.current;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      c = Math.min(TIMELINE_S, c + dt * SPEED);
      cursorRef.current = c;
      const n = priorRef.current.length;
      if (n < TIMES.length && c >= TIMES[n]) evaluateNext(TIMES[n]);
      setCursor(c);
      if (priorRef.current.length >= TIMES.length) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, calm, evaluateNext]);

  const reset = useCallback(() => {
    priorRef.current = [];
    cursorRef.current = 0;
    setResults([]);
    setCursor(0);
    setPlaying(false);
  }, []);

  const selectMode = (m: WindowMode) => {
    setMode(m);
    reset();
  };

  const stepNext = () => {
    const n = priorRef.current.length;
    if (n >= TIMES.length) return;
    const t = TIMES[n];
    evaluateNext(t);
    cursorRef.current = t;
    setCursor(t);
  };

  const active = MODES.find((m) => m.id === mode) ?? MODES[0];
  const done = results.length >= TIMES.length;
  const allowedCount = results.filter((r) => r.allowed).length;
  const rejectedCount = results.length - allowedCount;
  const last = results.length > 0 ? results[results.length - 1] : null;
  const lastTime = TIMES[results.length - 1];

  const boxClass =
    'fill-amber-100/60 stroke-amber-300 dark:fill-amber-950/40 dark:stroke-amber-800';
  const boxLabelClass = 'diagram-mono fill-amber-800 dark:fill-amber-200';

  return (
    <motion.div
      className="not-prose diagram-panel my-8 rounded-xl border border-stone-200 bg-stone-50 p-5 shadow-soft dark:border-stone-800 dark:bg-stone-950"
      {...entrance}
    >
      <h4 className="diagram-mono mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
        {title}
      </h4>

      {/* Mode tabs */}
      <div
        className="mb-3 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Rate limiting strategy"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === mode}
            onClick={() => selectMode(m.id)}
            className={tabClass(m.id === mode)}
          >
            {m.tab}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
        {active.blurb}
      </p>

      {/* Running counters */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="diagram-mono text-xs text-stone-600 dark:text-stone-300">
          Allowed{' '}
          <strong className="font-bold text-emerald-600 dark:text-emerald-400">
            {allowedCount}
          </strong>
        </span>
        <span className="diagram-mono text-xs text-stone-600 dark:text-stone-300">
          Rejected (429s){' '}
          <strong className="font-bold text-rose-600 dark:text-rose-400">
            {rejectedCount}
          </strong>
        </span>
        <span className="diagram-mono ml-auto text-xs text-stone-400 dark:text-stone-500">
          limit {LIMIT} / {WINDOW_S}s
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="mx-auto block w-full max-w-2xl"
          role="img"
          aria-label={`${title}: request timeline from 0 to 20 seconds using ${active.tab.toLowerCase()}`}
        >
          {/* Window boxes: two static blocks for fixed, one trailing box
              that follows the cursor for sliding */}
          {mode === 'fixed' ? (
            [0, 1].map((b) => (
              <g key={b}>
                <rect
                  x={x(b * WINDOW_S)}
                  y={BOX_Y}
                  width={x((b + 1) * WINDOW_S) - x(b * WINDOW_S)}
                  height={BOX_H}
                  rx={6}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  className={boxClass}
                />
                <text
                  x={x(b * WINDOW_S) + 8}
                  y={BOX_Y + 16}
                  fontSize={10}
                  className={boxLabelClass}
                >
                  window [{b * WINDOW_S}, {(b + 1) * WINDOW_S})
                </text>
              </g>
            ))
          ) : (
            <g>
              <rect
                x={x(Math.max(0, cursor - WINDOW_S))}
                y={BOX_Y}
                width={Math.max(
                  0,
                  x(cursor) - x(Math.max(0, cursor - WINDOW_S)),
                )}
                height={BOX_H}
                rx={6}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                className={boxClass}
              />
              <text
                x={(x(Math.max(0, cursor - WINDOW_S)) + x(cursor)) / 2}
                y={BOX_Y + 16}
                textAnchor="middle"
                fontSize={10}
                className={boxLabelClass}
              >
                trailing 10 s
              </text>
            </g>
          )}

          {/* Boundary marker */}
          <line
            x1={x(10)}
            y1={BOX_Y - 14}
            x2={x(10)}
            y2={AXIS_Y + 40}
            className="stroke-rose-400 dark:stroke-rose-500"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text
            x={x(10)}
            y={BOX_Y - 20}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            className="diagram-mono fill-rose-600 dark:fill-rose-400"
          >
            t = 10 boundary
          </text>

          {/* Time cursor */}
          <line
            x1={x(cursor)}
            y1={BOX_Y - 8}
            x2={x(cursor)}
            y2={AXIS_Y + 40}
            className="stroke-amber-500 dark:stroke-amber-400"
            strokeWidth={2}
          />
          <circle
            cx={x(cursor)}
            cy={BOX_Y - 8}
            r={4}
            className="fill-amber-500 dark:fill-amber-400"
          />

          {/* Axis */}
          <line
            x1={x(0)}
            y1={AXIS_Y}
            x2={x(TIMELINE_S)}
            y2={AXIS_Y}
            className="stroke-stone-400 dark:stroke-stone-500"
            strokeWidth={2}
          />
          {[0, 5, 10, 15, 20].map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                y1={AXIS_Y - 5}
                x2={x(t)}
                y2={AXIS_Y + 5}
                className="stroke-stone-400 dark:stroke-stone-500"
                strokeWidth={2}
              />
              <text
                x={x(t)}
                y={AXIS_Y + 22}
                textAnchor="middle"
                fontSize={10}
                className="diagram-mono fill-stone-500 dark:fill-stone-400"
              >
                {t}s
              </text>
            </g>
          ))}

          {/* Request ticks: stone = pending, emerald = allowed, rose = 429 */}
          {TIMES.map((t, i) => {
            const r = results[i];
            const tickClass = !r
              ? 'stroke-stone-300 dark:stroke-stone-600'
              : r.allowed
                ? 'stroke-emerald-500 dark:stroke-emerald-400'
                : 'stroke-rose-500 dark:stroke-rose-400';
            return (
              <g key={t}>
                <line
                  x1={x(t)}
                  y1={AXIS_Y - 10}
                  x2={x(t)}
                  y2={AXIS_Y + 10}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  className={tickClass}
                />
                {r && !r.allowed && (
                  <text
                    x={x(t)}
                    y={AXIS_Y - 18}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    className="diagram-mono fill-rose-600 dark:fill-rose-400"
                  >
                    429
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Status / final caption */}
      <div aria-live="polite" className="mt-4 min-h-12">
        {done ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {active.caption}
          </p>
        ) : (
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {last
              ? `t = ${lastTime.toFixed(1)}s — ${
                  last.allowed ? 'allowed' : 'rejected with 429'
                } (${last.count}/${LIMIT} in ${last.windowLabel}).`
              : 'Press Play to sweep the timeline, or step through the requests one at a time.'}
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
        <button
          type="button"
          onClick={stepNext}
          className={btnClass}
          disabled={done}
        >
          Next request
        </button>
      </div>

      <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
        This is the ZADD + ZREMRANGEBYSCORE + ZCOUNT pattern from the lesson.
      </p>
    </motion.div>
  );
}
