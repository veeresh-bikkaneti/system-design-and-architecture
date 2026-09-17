import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { lessonManifest } from './lesson-manifest';

export type Tier = 'beginner' | 'intermediate' | 'advanced';

export interface LessonMeta {
  slug: string;
  title: string;
  tier: Tier;
  order: number;
  summary: string;
  estimatedMinutes: number;
  /** 1 (gentlest) to 5 (steepest). Optional — cards fall back to a tier-based value. */
  difficulty?: number;
  /** Short topic tags shown on lesson cards, e.g. ['caching', 'databases']. */
  topics?: string[];
}

export interface Lesson {
  meta: LessonMeta;
  /**
   * Lazy loader for the lesson's MDX component. Each lesson ships as its own
   * async chunk — the syllabus metadata above stays in the main bundle so
   * lists/roadmap/badges render without loading any lesson body.
   */
  loadComponent: () => Promise<ComponentType>;
  /**
   * Stable React.lazy wrapper around `loadComponent`, created once per lesson
   * at module level. `lazy()` fetches nothing until first render, so this
   * costs nothing up front and gives React a stable component identity.
   */
  Body: LazyExoticComponent<ComponentType>;
}

const componentLoaders = import.meta.glob<{ default: ComponentType }>(
  '/content/lessons/*.mdx',
);

function loaderFor(slug: string): () => Promise<ComponentType> {
  const load = componentLoaders[`/content/lessons/${slug}.mdx`];
  if (!load) throw new Error(`No MDX module found for lesson slug: ${slug}`);
  return () => load().then((mod) => mod.default);
}

export const lessons: Lesson[] = lessonManifest.map((meta) => {
  const loadComponent = loaderFor(meta.slug);
  return {
    meta,
    loadComponent,
    Body: lazy(() => loadComponent().then((c) => ({ default: c }))),
  };
});

export function getLessonBySlug(slug: string): Lesson | undefined {
  return lessons.find((lesson) => lesson.meta.slug === slug);
}

export const tierOrder: Tier[] = ['beginner', 'intermediate', 'advanced'];

export const tierLabels: Record<Tier, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
