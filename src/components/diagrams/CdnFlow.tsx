import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './diagrams.css';
import { useDiagramEntrance } from './useDiagramEntrance';

/**
 * Props for {@link CdnFlow}.
 */
export interface CdnFlowProps {
  /**
   * Heading rendered above the diagram.
   * Defaults to `"One request from Sydney, two journeys"`.
   */
  title?: string;
}

type CdnNodeId = 'browser' | 'pop' | 'origin';

/** One step of a CDN journey: a hop plus the readout shown for it. */
interface CdnStep {
  /** Node the request dot starts from. */
  from: CdnNodeId;
  /** Node the request dot travels to (`from === to` dwells in place). */
  to: CdnNodeId;
  /** Readout line highlighted while this step is active. */
  caption: string;
  /** One-sentence explanation shown under the readout. */
  note: string;
}

/** A tabbed CDN journey: edge hit or edge miss. */
interface CdnMode {
  id: 'hit' | 'miss';
  tab: string;
  steps: CdnStep[];
}

const MODES: CdnMode[] = [
  {
    id: 'hit',
    tab: 'Repeat visitor · edge hit',
    steps: [
      {
        from: 'browser',
        to: 'pop',
        caption: 'Lands at Sydney PoP',
        note: 'The request never leaves the metro — DNS steers it to the nearest point of presence.',
      },
      {
        from: 'pop',
        to: 'pop',
        caption: 'Bytes already cached',
        note: 'The PoP holds a fresh copy left by an earlier visitor.',
      },
      {
        from: 'pop',
        to: 'browser',
        caption: 'Served in ~10 ms · origin never involved',
        note: 'A memory lookup and a short hop back — the origin never hears about it.',
      },
    ],
  },
  {
    id: 'miss',
    tab: 'First visitor · edge miss',
    steps: [
      {
        from: 'browser',
        to: 'pop',
        caption: 'Lands at Sydney PoP',
        note: 'Same start as a repeat visitor.',
      },
      {
        from: 'pop',
        to: 'origin',
        caption: 'No copy — travels to Virginia origin',
        note: 'A cache miss means a ~14,000 km round trip across the Pacific.',
      },
      {
        from: 'origin',
        to: 'pop',
        caption: 'Origin serves bytes, edge cache fills on the way back',
        note: 'The response is stored at the PoP as it passes through.',
      },
      {
        from: 'pop',
        to: 'browser',
        caption: 'Served in ~200 ms · next visitor gets 10 ms',
        note: 'Slow once — then fast for everyone who follows.',
      },
    ],
  },
];

const VIEW_W = 660;
const VIEW_H = 260;
const NODE_W = 140;
const NODE_H = 46;
const MID_Y = 130;

const CENTERS: Record<CdnNodeId, { x: number; y: number }> = {
  browser: { x: 110, y: MID_Y },
  pop: { x: 330, y: MID_Y },
  origin: { x: 550, y: MID_Y },
};

/** Whole journey lasts ~4s; each step gets an equal slice. */
const journeyStepMs = (steps: number) => Math.round(4000 / steps);
const DOT_S = 0.9;

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
 * Animated CDN diagram for MDX lessons. One request from Sydney takes two
 * possible journeys: an edge hit (Browser → PoP → Browser, ~10 ms) or an
 * edge miss (Browser → PoP → Origin → PoP → Browser, ~200 ms). A dot
 * travels the journey while the readout narrates each step; Play/Pause
 * runs the ~4s journey, and reduced/calm motion replaces autoplay with a
 * manual Next-step control. A latency bar pair at the bottom makes the
 * 20× difference visceral.
 *
 * @example
 * ```mdx
 * <CdnFlow />
 * <CdnFlow title="Edge hit vs. edge miss" />
 * ```
 */
export function CdnFlow({ title = 'One request from Sydney, two journeys' }: CdnFlowProps) {
  // Scroll-triggered entrance shared with every other diagram component —
  // see useDiagramEntrance.
  const entrance = useDiagramEntrance();
  const reduceMotion = useReducedMotion();
  const [modeIdx, setModeIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(() => !isCalmMotion());

  const calm = reduceMotion || isCalmMotion();
  const mode = MODES[modeIdx];
  const step = mode.steps[stepIdx];
  const lastIdx = mode.steps.length - 1;
  const isLastStep = stepIdx === lastIdx;
  const stepMs = journeyStepMs(mode.steps.length);

  // Auto-advance through the journey; never autoplay under reduced/calm
  // motion, and stop on the final step.
  useEffect(() => {
    if (!playing || calm || isLastStep) {
      if (playing && isLastStep) setPlaying(false);
      return;
    }
    const t = setTimeout(() => {
      setStepIdx((i) => {
        const next = Math.min(i + 1, lastIdx);
        if (next === lastIdx) setPlaying(false);
        return next;
      });
    }, stepMs);
    return () => clearTimeout(t);
  }, [playing, calm, isLastStep, lastIdx, stepMs]);

  const goTo = (i: number) => setStepIdx(Math.min(Math.max(i, 0), lastIdx));
  const selectMode = (i: number) => {
    setModeIdx(i);
    setStepIdx(0);
    setPlaying(false);
  };

  const fromC = CENTERS[step.from];
  const toC = CENTERS[step.to];
  // Dwell steps (from === to) hop gently in place so the dot stays alive.
  const via =
    step.from === step.to
      ? { x: fromC.x, y: fromC.y - 14 }
      : { x: (fromC.x + toC.x) / 2, y: (fromC.y + toC.y) / 2 };

  const involves = (a: CdnNodeId, b: CdnNodeId) =>
    (step.from === a && step.to === b) || (step.from === b && step.to === a);
  const edgeClass = (active: boolean) =>
    active
      ? 'stroke-amber-500 dark:stroke-amber-400'
      : 'stroke-stone-300 dark:stroke-stone-600';

  const warmed = mode.id === 'miss' && isLastStep;

  return (
    <motion.div
      className="not-prose diagram-panel my-8 rounded-xl border border-stone-200 bg-stone-50 p-5 shadow-soft dark:border-stone-800 dark:bg-stone-950"
      {...entrance}
    >
      <h4 className="diagram-mono mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
        {title}
      </h4>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="CDN journey">
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
          aria-label={`${title}: ${mode.tab}, step ${stepIdx + 1} of ${mode.steps.length}: ${step.caption}`}
        >
          {/* Edges */}
          <line
            x1={CENTERS.browser.x + NODE_W / 2}
            y1={MID_Y}
            x2={CENTERS.pop.x - NODE_W / 2}
            y2={MID_Y}
            className={edgeClass(involves('browser', 'pop'))}
            strokeWidth={involves('browser', 'pop') ? 2.5 : 2}
          />
          <line
            x1={CENTERS.pop.x + NODE_W / 2}
            y1={MID_Y}
            x2={CENTERS.origin.x - NODE_W / 2}
            y2={MID_Y}
            className={edgeClass(involves('pop', 'origin'))}
            strokeWidth={involves('pop', 'origin') ? 2.5 : 2}
          />

          {/* Nodes: Browser (client, cyan), PoP (edge/infra, amber), Origin (service, emerald) */}
          <g>
            <rect
              x={CENTERS.browser.x - NODE_W / 2}
              y={MID_Y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={9}
              strokeWidth={1.5}
              className="fill-cyan-50 stroke-cyan-600 dark:fill-cyan-950/60 dark:stroke-cyan-400"
            />
            <text
              x={CENTERS.browser.x}
              y={MID_Y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              className="diagram-mono fill-cyan-950 dark:fill-cyan-100"
            >
              Browser · Sydney
            </text>
          </g>
          <g>
            <rect
              x={CENTERS.pop.x - NODE_W / 2}
              y={MID_Y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={9}
              strokeWidth={1.5}
              className="fill-amber-50 stroke-amber-500 dark:fill-amber-950/60 dark:stroke-amber-400"
            />
            <text
              x={CENTERS.pop.x}
              y={MID_Y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              className="diagram-mono fill-amber-950 dark:fill-amber-100"
            >
              Edge PoP · Sydney
            </text>
          </g>
          <g>
            <rect
              x={CENTERS.origin.x - NODE_W / 2}
              y={MID_Y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={9}
              strokeWidth={1.5}
              className="fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950/60 dark:stroke-emerald-400"
            />
            <text
              x={CENTERS.origin.x}
              y={MID_Y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              className="diagram-mono fill-emerald-950 dark:fill-emerald-100"
            >
              Origin · Virginia
            </text>
          </g>

          {/* "warmed" badge once the miss journey has filled the edge cache */}
          {warmed && (
            <g>
              <rect
                x={CENTERS.pop.x - 38}
                y={76}
                width={76}
                height={20}
                rx={10}
                strokeWidth={1.5}
                className="fill-emerald-100 stroke-emerald-500 dark:fill-emerald-950/60 dark:stroke-emerald-400"
              />
              <text
                x={CENTERS.pop.x}
                y={86}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fontWeight={700}
                className="diagram-mono fill-emerald-950 dark:fill-emerald-100"
              >
                warmed
              </text>
            </g>
          )}

          {/* Traveling request dot for the active step */}
          <motion.circle
            key={`${mode.id}-${stepIdx}`}
            r={7}
            className="fill-amber-500 dark:fill-amber-400"
            initial={{ cx: fromC.x, cy: fromC.y }}
            animate={{ cx: [fromC.x, via.x, toC.x], cy: [fromC.y, via.y, toC.y] }}
            transition={{ duration: DOT_S, ease: 'easeInOut', times: [0, 0.5, 1] }}
          />
        </svg>
      </div>

      {/* Step readout */}
      <div aria-live="polite" className="mt-4">
        <ol className="space-y-1.5">
          {mode.steps.map((s, i) => {
            const state = i < stepIdx ? 'done' : i === stepIdx ? 'current' : 'todo';
            return (
              <li
                key={i}
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex items-baseline gap-2.5"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full ${
                    state === 'current'
                      ? 'bg-amber-500'
                      : state === 'done'
                        ? 'bg-stone-400 dark:bg-stone-500'
                        : 'bg-stone-300 dark:bg-stone-600'
                  }`}
                />
                <span
                  className={`diagram-mono text-sm ${
                    state === 'current'
                      ? 'font-semibold text-amber-800 dark:text-amber-200'
                      : state === 'done'
                        ? 'text-stone-500 dark:text-stone-400'
                        : 'text-stone-400 dark:text-stone-500'
                  }`}
                >
                  {s.caption}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 min-h-10 text-sm text-stone-600 dark:text-stone-300">
          {step.note}
        </p>
        {warmed && (
          <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Edge cache warmed — now replay as a repeat visitor.
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!calm ? (
          <button
            type="button"
            onClick={() => {
              if (isLastStep && !playing) {
                setStepIdx(0);
                setPlaying(true);
              } else {
                setPlaying((p) => !p);
              }
            }}
            className={BTN}
            aria-label={playing ? 'Pause journey' : 'Play journey'}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => goTo(stepIdx - 1)}
              disabled={stepIdx === 0}
              className={BTN}
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => goTo(stepIdx + 1)}
              disabled={isLastStep}
              className={BTN}
            >
              Next step →
            </button>
          </>
        )}
      </div>

      {/* Latency comparison: the 20× difference, made visceral */}
      <div className="mt-5 space-y-2.5 border-t border-stone-200 pt-4 dark:border-stone-800">
        <p className="diagram-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
          Latency · same bytes
        </p>
        <div className="flex items-center gap-3">
          <span className="diagram-mono w-20 shrink-0 text-xs text-stone-600 dark:text-stone-300">
            Edge hit
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-stone-200/70 dark:bg-stone-800">
            <div
              className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
              style={{ width: '5%' }}
            />
          </div>
          <span className="diagram-mono w-16 shrink-0 text-right text-xs font-semibold text-stone-700 dark:text-stone-200">
            ~10 ms
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="diagram-mono w-20 shrink-0 text-xs text-stone-600 dark:text-stone-300">
            Edge miss
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-stone-200/70 dark:bg-stone-800">
            <div
              className="h-full rounded-full bg-rose-500 dark:bg-rose-400"
              style={{ width: '100%' }}
            />
          </div>
          <span className="diagram-mono w-16 shrink-0 text-right text-xs font-semibold text-stone-700 dark:text-stone-200">
            ~200 ms
          </span>
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Same object, same browser — only the cache state differs.
        </p>
      </div>
    </motion.div>
  );
}
