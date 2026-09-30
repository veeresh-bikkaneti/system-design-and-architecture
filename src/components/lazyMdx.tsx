import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ComponentType, Ref } from 'react';

/**
 * How far ahead of the viewport a diagram's chunk starts loading. Generous
 * on purpose: the goal is to avoid fetching the chunk for diagrams the
 * reader never scrolls to, not to shave the last millisecond off diagrams
 * they will see.
 */
export const DIAGRAM_PRELOAD_MARGIN = '800px 0px';

/**
 * Watch `el` and invoke `onNear` the first time it comes within `rootMargin`
 * of the viewport. The observer disconnects after firing (and on cleanup),
 * so each element pays for at most one observation.
 *
 * When IntersectionObserver is unavailable (SSR, very old browsers) the
 * callback fires immediately — content must never be stuck unloaded.
 *
 * @returns a cleanup function that disconnects the observer.
 */
export function observeNearViewport(
  el: Element,
  onNear: () => void,
  rootMargin: string = DIAGRAM_PRELOAD_MARGIN,
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onNear();
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onNear();
        io.disconnect();
      }
    },
    { rootMargin },
  );
  io.observe(el);
  return () => io.disconnect();
}

/**
 * React hook version of {@link observeNearViewport}: attach the returned
 * `ref` to the placeholder element and read `near` to decide when to start
 * loading the heavy component.
 */
export function useNearViewport(rootMargin: string = DIAGRAM_PRELOAD_MARGIN): {
  ref: Ref<HTMLDivElement>;
  near: boolean;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el) return;
    return observeNearViewport(el, () => setNear(true), rootMargin);
  }, [near, rootMargin]);
  return { ref, near };
}

// oxlint-disable-next-line no-explicit-any
export type AnyComponent = ComponentType<any>;

/**
 * Wrap a heavy MDX component in React.lazy + Suspense so interactive diagrams
 * ship as separate chunks instead of bloating the entry bundle. MDX pages
 * only pay for the diagrams they actually render.
 *
 * The dynamic import is additionally gated behind an IntersectionObserver:
 * it starts only when the diagram's placeholder comes within
 * {@link DIAGRAM_PRELOAD_MARGIN} of the viewport, so e.g. mermaid (~400 KB
 * raw) is never fetched for diagrams the reader never scrolls to. (The
 * pre-existing observer in MermaidDiagram only pauses SMIL animation; it
 * never gated loading.)
 */
export function lazyMdx(
  // oxlint-disable-next-line no-explicit-any
  loader: () => Promise<{ default: AnyComponent }>,
  label: string,
): AnyComponent {
  const Lazy = lazy(loader);

  // Small loading skeleton for this wrapper. Defined locally so this module
  // has no top-level component alongside its helpers (keeps fast-refresh
  // linting happy); created once per lazyMdx call, alongside LazyMdx.
  function DiagramPlaceholder({
    label,
    targetRef,
  }: {
    label: string;
    targetRef?: Ref<HTMLDivElement>;
  }) {
    return (
      <div
        ref={targetRef}
        className="my-6 rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-700 dark:text-stone-500"
        aria-hidden="true"
      >
        Loading {label}…
      </div>
    );
  }

  function LazyMdx(props: Record<string, unknown>) {
    const { ref, near } = useNearViewport();
    if (!near) {
      // Placeholder doubles as the observation target; the import starts
      // only once this scrolls near the viewport.
      return <DiagramPlaceholder label={label} targetRef={ref} />;
    }
    return (
      <Suspense fallback={<DiagramPlaceholder label={label} />}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  LazyMdx.displayName = `LazyMdx(${label})`;
  return LazyMdx;
}
