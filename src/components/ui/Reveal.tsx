import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useDiagramEntrance } from '../diagrams/useDiagramEntrance';

/**
 * The one scroll-reveal. Uses the shared diagram-entrance spring contract
 * (stiffness 100, damping 20, fires once at -60px viewport margin,
 * transform + opacity only) so page reveals and diagram reveals behave
 * identically. Renders statically under reduced motion. Replaces the
 * hand-rolled IntersectionObserver Reveal that lived in RoadmapPage.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const entrance = useDiagramEntrance();
  const transition = 'transition' in entrance && entrance.transition ? entrance.transition : undefined;
  return (
    <motion.div
      {...entrance}
      transition={transition ? { ...transition, delay: delay / 1000 } : undefined}
      className={className}
    >
      {children}
    </motion.div>
  );
}
