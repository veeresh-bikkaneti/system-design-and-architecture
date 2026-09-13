import { useState } from 'react';

/**
 * A node drawn on the {@link StepThrough} diagram canvas (480x300).
 */
export interface StepThroughNode {
  /** Unique id referenced by `StepThroughStep.highlight`. */
  id: string;
  /** Text shown inside the node box. */
  label: string;
  /** Center position of the node on the 480x300 canvas. */
  x: number;
  y: number;
  /** Box width. Defaults to 120. */
  w?: number;
  /** Box height. Defaults to 42. */
  h?: number;
}

/**
 * An edge drawn between two nodes on the {@link StepThrough} diagram canvas.
 */
export interface StepThroughEdge {
  /** Id of the source node. */
  from: string;
  /** Id of the target node. */
  to: string;
}

/**
 * One step in a {@link StepThrough} walkthrough.
 */
export interface StepThroughStep {
  /** Short heading for the step, e.g. "Leader elected". */
  title: string;
  /** One or two sentences explaining what happens in this step. */
  caption: string;
  /** Ids of diagram nodes to highlight while this step is active. */
  highlight?: string[];
}

/**
 * Props for {@link StepThrough}.
 */
export interface StepThroughProps {
  /** Optional heading rendered above the diagram. */
  title?: string;
  /** Nodes drawn on the 480x300 diagram canvas. Omit for a text-only stepper. */
  nodes?: StepThroughNode[];
  /** Edges drawn between nodes (rendered under the nodes). */
  edges?: StepThroughEdge[];
  /** The ordered steps of the scenario. At least one is required. */
  steps: StepThroughStep[];
  /** Step shown first. Defaults to 0. */
  initialStep?: number;
}

const CANVAS_W = 480;
const CANVAS_H = 300;

/**
 * Click-to-advance stepper for MDX lessons. Walks the reader through a
 * sequence or failure scenario: each step shows a caption and highlights
 * part of a simple author-defined SVG diagram. Readers move with
 * Previous/Next buttons or by clicking the step dots.
 *
 * @example
 * ```mdx
 * <StepThrough
 *   title="Leader election"
 *   nodes={[{ id: "a", label: "Node A", x: 90, y: 150 }, { id: "b", label: "Node B", x: 240, y: 150 }, { id: "c", label: "Node C", x: 390, y: 150 }]}
 *   steps={[
 *     { title: "Heartbeat stops", caption: "Node A misses three heartbeats from the leader.", highlight: ["a"] },
 *     { title: "Election starts", caption: "Node A requests votes from B and C.", highlight: ["a", "b", "c"] },
 *   ]}
 * />
 * ```
 */
export function StepThrough({
  title,
  nodes = [],
  edges = [],
  steps,
  initialStep = 0,
}: StepThroughProps) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialStep, 0), Math.max(steps.length - 1, 0)),
  );
  const step = steps[index];
  const highlighted = new Set(step?.highlight ?? []);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const goTo = (i: number) => setIndex(Math.min(Math.max(i, 0), steps.length - 1));

  return (
    <div className="not-prose my-8 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      {title && (
        <h4 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h4>
      )}

      {nodes.length > 0 && (
        <svg
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="mx-auto mb-4 block w-full max-w-xl"
          role="img"
          aria-label={title ?? 'Step diagram'}
        >
          {edges.map((e, i) => {
            const from = nodeById.get(e.from);
            const to = nodeById.get(e.to);
            if (!from || !to) return null;
            return (
              <line
                key={`edge-${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className="stroke-slate-300 dark:stroke-slate-600"
                strokeWidth={2}
              />
            );
          })}
          {nodes.map((n) => {
            const w = n.w ?? 120;
            const h = n.h ?? 42;
            const active = highlighted.has(n.id);
            return (
              <g key={n.id} className={active ? 'stepthrough-highlight' : undefined}>
                <rect
                  x={n.x - w / 2}
                  y={n.y - h / 2}
                  width={w}
                  height={h}
                  rx={9}
                  strokeWidth={active ? 2.5 : 1.5}
                  className={
                    active
                      ? 'fill-violet-100 stroke-violet-500 dark:fill-violet-950/70 dark:stroke-violet-400'
                      : 'fill-slate-50 stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-600'
                  }
                />
                <text
                  x={n.x}
                  y={n.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={active ? 700 : 500}
                  className={
                    active
                      ? 'fill-violet-900 dark:fill-violet-100'
                      : 'fill-slate-600 dark:fill-slate-300'
                  }
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* Step content */}
      <div key={index} className="vs-panel-enter">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600 dark:text-violet-400">
          Step {index + 1} of {steps.length}
        </p>
        <h5 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {step?.title}
        </h5>
        <p className="mt-1 min-h-12 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {step?.caption}
        </p>
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ← Previous
        </button>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Steps">
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all ${
                i === index
                  ? 'w-6 bg-violet-500'
                  : 'w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === steps.length - 1}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
