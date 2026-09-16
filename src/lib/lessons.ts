import type { ComponentType } from 'react';

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
  Component: ComponentType;
}

type LessonModule = {
  meta: LessonMeta;
  default: ComponentType;
};

const modules = import.meta.glob<LessonModule>('/content/lessons/*.mdx', {
  eager: true,
});

export const lessons: Lesson[] = Object.values(modules)
  .map((mod) => ({ meta: mod.meta, Component: mod.default }))
  .sort((a, b) => a.meta.order - b.meta.order);

export function getLessonBySlug(slug: string): Lesson | undefined {
  return lessons.find((lesson) => lesson.meta.slug === slug);
}

export const tierOrder: Tier[] = ['beginner', 'intermediate', 'advanced'];

export const tierLabels: Record<Tier, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
