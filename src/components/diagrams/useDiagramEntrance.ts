import { useReducedMotion } from 'motion/react';

/**
 * Shared scroll-triggered entrance for every lesson diagram component
 * (MermaidDiagram, PacketFlow, StepThrough, VsToggle).
 *
 * Contract, per the motion-framer skill:
 * - "Gentle" spring preset (stiffness 100, damping 20), fired once when the
 *   diagram scrolls into view (viewport margin -60px so it starts just
 *   before the diagram is fully visible).
 * - Transform + opacity only (hardware-accelerated, no layout thrash).
 * - Skipped entirely when the user prefers reduced motion — the returned
 *   props are empty, so the diagram renders statically.
 *
 * In-diagram motion (flowing Mermaid edges, node cascades, PacketFlow
 * request dots, StepThrough highlight glow, VsToggle panel swap) lives in
 * diagrams.css / component keyframes; this hook only handles the
 * container's scroll reveal so all four components behave identically.
 */
export function useDiagramEntrance() {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return {};

  return {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { type: 'spring' as const, stiffness: 100, damping: 20 },
  };
}
