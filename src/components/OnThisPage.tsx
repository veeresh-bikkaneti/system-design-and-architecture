import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  HeadingsValueContext,
  RegisterHeadingContext,
  useHeadings,
  type LessonHeading,
} from './headings';

/**
 * Lightweight registry that MDX `##` headings self-register into (see the
 * `h2` override in `src/App.tsx`). Scoped per lesson: `LessonPage` renders
 * one provider keyed by slug, so headings never leak between lessons.
 */
export function HeadingsProvider({ children }: { children: ReactNode }) {
  const [headings, setHeadings] = useState<LessonHeading[]>([]);

  const register = useCallback((heading: LessonHeading) => {
    setHeadings((prev) =>
      prev.some((h) => h.id === heading.id) ? prev : [...prev, heading],
    );
  }, []);

  return (
    <RegisterHeadingContext.Provider value={register}>
      <HeadingsValueContext.Provider value={headings}>
        {children}
      </HeadingsValueContext.Provider>
    </RegisterHeadingContext.Provider>
  );
}

/**
 * Sticky "On this page" rail with scrollspy. Rendered inside the lesson's
 * xl-only grid column; renders nothing when the lesson has no `##` headings.
 * Plain anchor links — no smooth-scroll JS, so reduced-motion users get
 * instant jumps and nothing is ever hidden behind animation.
 */
export function OnThisPage() {
  const headings = useHeadings();
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (headings.length === 0) return;
    const visible = new Set<string>();
    const pickActive = () => {
      // The active heading is the earliest one in document order that is
      // currently visible — this keeps the highlight stable while scrolling.
      const first = headings.find((h) => visible.has(h.id));
      setActiveId(first ? first.id : '');
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        pickActive();
      },
      // A heading counts as "current" while it sits in the upper half of
      // the viewport, below the sticky site header.
      { rootMargin: '-20% 0px -60% 0px' },
    );
    for (const heading of headings) {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="hidden xl:block">
      <div className="sticky top-20 max-h-[calc(100svh-7rem)] overflow-y-auto">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
          On this page
        </p>
        <ul className="mt-3 space-y-1 border-l border-stone-200 dark:border-stone-800">
          {headings.map((heading) => {
            const active = heading.id === activeId;
            return (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  aria-current={active ? 'location' : undefined}
                  className={`-ml-px block border-l-2 py-1 pl-3 pr-2 text-[13px] leading-snug transition-colors ${
                    active
                      ? 'border-accent-500 font-semibold text-stone-900 dark:border-accent-400 dark:text-stone-50'
                      : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-stone-200'
                  }`}
                >
                  {heading.title}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
