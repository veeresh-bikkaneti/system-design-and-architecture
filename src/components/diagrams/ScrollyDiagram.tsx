import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import './diagrams.css';
import { useDiagramEntrance } from './useDiagramEntrance';

/**
 * A node drawn on the {@link ScrollyDiagram} canvas. Coordinates are in
 * canvas units; the viewBox is computed from the node bounds automatically.
 */
export interface ScrollyNode {
  /** Unique id referenced by `ScrollyStep.nodes`. */
  id: string;
  /** Text shown inside the node box. Keep it short (one or two words). */
  label: string;
  /** Optional second line under the label, e.g. "3 replicas". */
  sub?: string;
  /** Center position of the node on the canvas. */
  x: number;
  y: number;
}

/**
 * An edge drawn between two nodes on the {@link ScrollyDiagram} canvas.
 * The line is trimmed to the node borders and gets an arrowhead.
 */
export interface ScrollyEdge {
  /** Unique id referenced by `ScrollyStep.edges`. */
  id: string;
  /** Id of the source node. */
  from: string;
  /** Id of the target node. */
  to: string;
  /** Optional small label rendered at the edge midpoint, e.g. "reads". */
  label?: string;
}

/**
 * One scrolling step of a {@link ScrollyDiagram} story.
 */
export interface ScrollyStep {
  /** Short heading for the step, e.g. "Add a cache". */
  title: string;
  /** One to three beginner-friendly sentences explaining this stage. */
  body: string;
  /** Ids of nodes to highlight while this step is active. */
  nodes: string[];
  /** Ids of edges to highlight while this step is active. */
  edges: string[];
}

/**
 * Props for {@link ScrollyDiagram}.
 */
export interface ScrollyDiagramProps {
  /** Nodes drawn on the diagram canvas. */
  nodes: ScrollyNode[];
  /** Edges drawn between nodes (rendered under the nodes). */
  edges: ScrollyEdge[];
  /** The ordered steps of the story. At least one is required. */
  steps: ScrollyStep[];
  /** Optional small caption rendered under the diagram. */
  caption?: string;
}

const NODE_W = 132;
const NODE_H = 50;
const VIEW_PAD = 30;

/**
 * Scroll-driven storytelling diagram for MDX lessons. On desktop the
 * diagram sticks to the left while the reader scrolls through step cards
 * on the right; the active step is derived from scroll progress, so the
 * highlighted nodes/edges always match the story beat in view. Every
 * step card is also a real button (plus Prev/Next and arrow keys), so
 * keyboard users and reduced-motion readers get the full story without
 * scrolling. On mobile the layout stacks: compact diagram on top, then
 * the step cards — nothing sticky, no scroll traps.
 *
 * Motion contract:
 * - Scroll only *selects* the active step; it never hijacks wheel/touch.
 * - Highlight changes are instant state swaps (opacity/color classes),
 *   not animated tweens, so nothing can trap content mid-animation.
 * - With `prefers-reduced-motion` the container entrance is skipped
 *   (via {@link useDiagramEntrance}), the amber glow is disabled by the
 *   shared reduced-motion CSS, and step jumps use instant scrolling.
 *
 * @example
 * ```mdx
 * <ScrollyDiagram
 *   nodes={[
 *     { id: "client", label: "Client", x: 80, y: 60 },
 *     { id: "server", label: "Server", sub: "does everything", x: 80, y: 200 },
 *   ]}
 *   edges={[{ id: "req", from: "client", to: "server", label: "request" }]}
 *   steps={[
 *     { title: "One server", body: "Every request lands on a single box.", nodes: ["client", "server"], edges: ["req"] },
 *     { title: "Add a load balancer", body: "Traffic spreads across more boxes.", nodes: ["client"], edges: [] },
 *   ]}
 *   caption="Follow the request as the system grows."
 * />
 * ```
 */
export function ScrollyDiagram({ nodes, edges, steps, caption }: ScrollyDiagramProps): JSX.Element {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [index, setIndex] = useState(0);
  const markerUid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const stepCount = Math.max(steps.length, 1);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  // Scroll selects the active step: the section's scroll range is split
  // into one equal slice per step. The same-value guard avoids re-renders.
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const i = Math.min(stepCount - 1, Math.max(0, Math.floor(v * stepCount)));
    setIndex((prev) => (prev === i ? prev : i));
  });

  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.min(Math.max(i, 0), stepCount - 1);
      setIndex(clamped);
      stepRefs.current[clamped]?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    },
    [reduceMotion, stepCount],
  );

  const step = steps[index];
  const activeNodes = useMemo(() => new Set(step?.nodes ?? []), [step]);
  const activeEdges = useMemo(() => new Set(step?.edges ?? []), [step]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // ViewBox derived from node bounds so authors only think in coordinates.
  const viewBox = useMemo(() => {
    if (nodes.length === 0) return `0 0 ${NODE_W} ${NODE_H}`;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - NODE_W / 2);
      maxX = Math.max(maxX, n.x + NODE_W / 2);
      minY = Math.min(minY, n.y - NODE_H / 2);
      maxY = Math.max(maxY, n.y + NODE_H / 2);
    }
    const x = minX - VIEW_PAD;
    const y = minY - VIEW_PAD;
    return `${x} ${y} ${maxX - minX + VIEW_PAD * 2} ${maxY - minY + VIEW_PAD * 2}`;
  }, [nodes]);

  /** Trim a center-to-center segment so it starts/ends at node borders. */
  const edgePath = useCallback(
    (from: ScrollyNode, to: ScrollyNode) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return null;
      const ux = dx / len;
      const uy = dy / len;
      // Ray-vs-rect exit fraction for a NODE_W x NODE_H box around center.
      const exit = (cx: number, cy: number, extra: number) => {
        const tx = ux !== 0 ? NODE_W / 2 / Math.abs(ux) : Infinity;
        const ty = uy !== 0 ? NODE_H / 2 / Math.abs(uy) : Infinity;
        const t = Math.min(tx, ty) + extra;
        return { x: cx + ux * t, y: cy + uy * t };
      };
      const start = exit(from.x, from.y, 2);
      const end = exit(to.x, to.y, 10); // room for the arrowhead
      return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    },
    [],
  );

  const onStepsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  // Scroll-triggered entrance shared with every other diagram component.
  // Returns {} under reduced motion, so the diagram renders statically.
  const entrance = useDiagramEntrance();
  const fadeClass = reduceMotion ? undefined : 'transition-opacity duration-300';

  const arrowDimId = `scrolly-arrow-dim-${markerUid}`;
  const arrowActiveId = `scrolly-arrow-active-${markerUid}`;

  return (
    <motion.div
      ref={sectionRef}
      className="not-prose diagram-panel my-8 rounded-xl border border-stone-200 bg-stone-50 p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950 sm:p-6"
      {...entrance}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
        {/* Sticky diagram column (static + compact on mobile). */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <svg
            viewBox={viewBox}
            className="mx-auto block h-auto w-full max-w-xl"
            role="img"
            aria-label={caption ?? 'Scrollytelling diagram'}
          >
            <defs>
              <marker
                id={arrowDimId}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="fill-stone-400 dark:fill-slate-500" />
              </marker>
              <marker
                id={arrowActiveId}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="fill-amber-500 dark:fill-amber-400" />
              </marker>
            </defs>

            {edges.map((e) => {
              const from = nodeById.get(e.from);
              const to = nodeById.get(e.to);
              if (!from || !to) return null;
              const seg = edgePath(from, to);
              if (!seg) return null;
              const active = activeEdges.has(e.id);
              const mx = (seg.x1 + seg.x2) / 2;
              const my = (seg.y1 + seg.y2) / 2;
              return (
                <g key={e.id} opacity={active ? 1 : 0.3} className={fadeClass}>
                  <line
                    x1={seg.x1}
                    y1={seg.y1}
                    x2={seg.x2}
                    y2={seg.y2}
                    strokeWidth={active ? 2.5 : 2}
                    markerEnd={`url(#${active ? arrowActiveId : arrowDimId})`}
                    className={
                      active
                        ? 'stroke-amber-500 dark:stroke-amber-400'
                        : 'stroke-stone-400 dark:stroke-slate-500'
                    }
                  />
                  {e.label && (
                    <text
                      x={mx}
                      y={my - 6}
                      textAnchor="middle"
                      fontSize={10}
                      className="diagram-mono fill-stone-500 stroke-stone-50 dark:fill-slate-400 dark:stroke-slate-950"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}

            {nodes.map((n) => {
              const active = activeNodes.has(n.id);
              return (
                <g
                  key={n.id}
                  opacity={active ? 1 : 0.35}
                  className={active ? `stepthrough-highlight ${fadeClass ?? ''}` : fadeClass}
                >
                  <rect
                    x={n.x - NODE_W / 2}
                    y={n.y - NODE_H / 2}
                    width={NODE_W}
                    height={NODE_H}
                    rx={10}
                    strokeWidth={active ? 2.5 : 1.5}
                    className={
                      active
                        ? 'fill-amber-100 stroke-amber-500 dark:fill-amber-950/60 dark:stroke-amber-400'
                        : 'fill-white stroke-stone-300 dark:fill-slate-900 dark:stroke-slate-600'
                    }
                  />
                  <text
                    x={n.x}
                    y={n.sub ? n.y - 7 : n.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={12}
                    fontWeight={active ? 700 : 600}
                    className={
                      active
                        ? 'diagram-mono fill-amber-950 dark:fill-amber-100'
                        : 'diagram-mono fill-stone-700 dark:fill-slate-200'
                    }
                  >
                    {n.label}
                  </text>
                  {n.sub && (
                    <text
                      x={n.x}
                      y={n.y + 10}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={10}
                      className="diagram-mono fill-stone-500 dark:fill-slate-400"
                    >
                      {n.sub}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {caption && (
            <p className="diagram-mono mt-3 text-center text-[11px] leading-relaxed text-stone-500 dark:text-slate-400">
              {caption}
            </p>
          )}

          {/* Step controls live with the diagram so they stay visible. */}
          <div className="mx-auto mt-4 flex max-w-xl items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ← Previous
            </button>
            <div className="flex items-center gap-1.5" role="group" aria-label="Story steps">
              {steps.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  aria-current={i === index ? 'step' : undefined}
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                  onClick={() => goTo(i)}
                  className={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${
                    i === index
                      ? 'w-6 bg-amber-500'
                      : 'w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              disabled={index === stepCount - 1}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Scrolling steps column. */}
        <ol
          aria-label="Diagram walkthrough steps"
          onKeyDown={onStepsKeyDown}
          className="mt-8 flex flex-col gap-5 lg:mt-0 lg:gap-0"
        >
          {steps.map((s, i) => {
            const active = i === index;
            return (
              <li
                key={i}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className="lg:flex lg:min-h-[68vh] lg:items-center lg:py-6"
              >
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={active ? 'step' : undefined}
                  className={`block w-full rounded-2xl border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 sm:p-6 ${
                    active
                      ? 'border-amber-400 bg-amber-50 shadow-soft dark:border-amber-700 dark:bg-amber-950/30'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-900/70'
                  }`}
                >
                  <span
                    className={`diagram-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${
                      active ? 'text-amber-700 dark:text-amber-400' : 'text-stone-400 dark:text-slate-500'
                    }`}
                  >
                    Step {i + 1} of {stepCount}
                  </span>
                  <span className="mt-1.5 block text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    {s.title}
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {s.body}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </motion.div>
  );
}
