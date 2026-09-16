import { createContext, useContext } from 'react';

/**
 * One `##` section heading harvested from the current MDX lesson.
 */
export interface LessonHeading {
  id: string;
  title: string;
}

export const RegisterHeadingContext = createContext<(heading: LessonHeading) => void>(
  () => {},
);
export const HeadingsValueContext = createContext<LessonHeading[]>([]);

/** All `##` headings registered by the current lesson, in document order. */
export function useHeadings(): LessonHeading[] {
  return useContext(HeadingsValueContext);
}

/** Register function consumed by the MDX `h2` override. No-op outside a provider. */
export function useRegisterHeading(): (heading: LessonHeading) => void {
  return useContext(RegisterHeadingContext);
}

/** Turn heading text into a stable, URL-safe anchor id. */
export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return slug === '' ? 'section' : slug;
}
