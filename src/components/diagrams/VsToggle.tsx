import { useState } from 'react';
import { motion } from 'motion/react';
import './diagrams.css';
import { useDiagramEntrance } from './useDiagramEntrance';

/**
 * One side of a {@link VsToggle} comparison.
 */
export interface VsScenario {
  /** Short label shown on the toggle button, e.g. "Cache hit". */
  label: string;
  /** Headline shown at the top of the panel. */
  title: string;
  /** Bullet points describing this scenario. */
  points: string[];
  /** Optional footnote, e.g. a latency figure or takeaway. */
  note?: string;
}

/**
 * Props for {@link VsToggle}.
 */
export interface VsToggleProps {
  /** Optional heading rendered above the toggle, e.g. "Consistency models". */
  title?: string;
  /** Scenario shown on the left toggle button. */
  a: VsScenario;
  /** Scenario shown on the right toggle button. */
  b: VsScenario;
  /** Which side is selected first. Defaults to `"a"`. */
  defaultSide?: 'a' | 'b';
}

/**
 * Side-by-side scenario toggle for MDX lessons. Compares two scenarios —
 * like CP vs AP, or cache hit vs cache miss — behind a segmented toggle
 * with a sliding indicator and an animated panel swap.
 *
 * @example
 * ```mdx
 * <VsToggle
 *   title="Read path"
 *   a={{ label: "Cache hit", title: "Served from memory", points: ["~1 ms response", "No origin load"], note: "The happy path." }}
 *   b={{ label: "Cache miss", title: "Falls through to origin", points: ["~200 ms response", "Origin must scale"], note: "Design for this path." }}
 * />
 * ```
 */
export function VsToggle({ title, a, b, defaultSide = 'a' }: VsToggleProps) {
  const [side, setSide] = useState<'a' | 'b'>(defaultSide);
  const scenario = side === 'a' ? a : b;
  const accent =
    side === 'a'
      ? {
          chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200',
          dot: 'bg-amber-500',
          border: 'border-amber-200 dark:border-amber-800',
        }
      : {
          chip: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/70 dark:text-cyan-200',
          dot: 'bg-cyan-500',
          border: 'border-cyan-200 dark:border-cyan-800',
        };

  // Scroll-triggered entrance shared with every other diagram component
  // (MermaidDiagram, PacketFlow, StepThrough) — see useDiagramEntrance.
  // The sliding indicator and panel swap stay interactive; only the
  // container reveals.
  const entrance = useDiagramEntrance();

  return (
    <motion.div
      className="not-prose diagram-panel my-8 rounded-xl border border-stone-200 bg-stone-50 p-5 shadow-soft dark:border-stone-800 dark:bg-stone-950"
      {...entrance}
    >
      {title && (
        <h4 className="diagram-mono mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
          {title}
        </h4>
      )}

      {/* Segmented toggle */}
      <div
        className="relative mx-auto grid max-w-md grid-cols-2 rounded-lg bg-stone-200/70 p-1 dark:bg-stone-800"
        role="tablist"
        aria-label={title ?? 'Scenario comparison'}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-white shadow-sm transition-transform duration-200 ease-out dark:bg-stone-900"
          style={{ transform: side === 'a' ? 'translateX(0)' : 'translateX(100%)' }}
        />
        {(['a', 'b'] as const).map((s) => {
          const label = s === 'a' ? a.label : b.label;
          const selected = side === s;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSide(s)}
              className={`relative z-10 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Scenario panel */}
      <div
        key={side}
        className={`vs-panel-enter mt-4 rounded-lg border ${accent.border} bg-white p-4 dark:bg-stone-900/60`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} aria-hidden="true" />
          <span
            className={`diagram-mono rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${accent.chip}`}
          >
            {scenario.label}
          </span>
        </div>
        <h5 className="mt-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
          {scenario.title}
        </h5>
        <ul className="mt-2 space-y-1.5">
          {scenario.points.map((point, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400 dark:bg-stone-500" aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
        {scenario.note && (
          <p className="mt-3 border-t border-stone-200 pt-2 text-xs italic text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {scenario.note}
          </p>
        )}
      </div>
    </motion.div>
  );
}
