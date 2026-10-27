import { useEffect, useState } from 'react';

/** The one desktop breakpoint query (Tailwind `lg`), shared by every mount. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Tracks the desktop breakpoint — true at ≥1024px viewport width.
 * The Ko-fi bench's three mounts (sidebar footer, in-flow card, lesson
 * dock) all gate on this one hook so exactly one grandpa is ever
 * JS-rendered per page; nothing is CSS-hidden into a second instance.
 * Without matchMedia (jsdom, very old browsers) it reports below-desktop,
 * matching the pre-ruling bench's fail-open reading of a missing query.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(DESKTOP_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
