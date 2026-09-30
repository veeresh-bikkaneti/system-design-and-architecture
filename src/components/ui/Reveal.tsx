import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

/**
 * The one scroll-reveal. Fires once, when the element scrolls to within
 * -60px of the viewport (matching the old diagram-entrance contract), using
 * a hand-rolled IntersectionObserver and a CSS opacity + translateY
 * transition instead of a motion spring. Renders statically under reduced
 * motion. Replaces the motion-based Reveal.
 *
 * Contract: transform + opacity only (hardware-accelerated, no layout
 * thrash), fires once, starts just before the element is fully visible.
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
  const reduceMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // No IntersectionObserver (old browsers / SSR): reveal immediately.
  const [revealed, setRevealed] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    if (reduceMotion) return;
    const el = ref.current;
    if (!el || revealed) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { rootMargin: '-60px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion, revealed]);

  // Under reduced motion the content renders at its final state immediately.
  const visible = reduceMotion || revealed;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(28px)',
        // easeOutQuint approximates the old critically-damped spring
        // (stiffness 100, damping 20) without pulling in a motion library.
        transition: reduceMotion
          ? undefined
          : `opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        willChange: visible ? undefined : 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}
