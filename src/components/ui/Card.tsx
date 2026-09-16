import type { HTMLAttributes } from 'react';

/**
 * The one card. Replaces ~10 hand-rolled card recipes across Home,
 * Lesson, Roadmap, Sidebar and Quiz. Tones:
 * - default: plain surface card
 * - accent: completed / highlighted state
 * - locked: dashed, muted — for gated lessons/badges
 * `hoverable` adds the single card hover physics (lift + accent border).
 */

export type CardTone = 'default' | 'accent' | 'locked';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  hoverable?: boolean;
  padding?: 'sm' | 'md' | 'lg';
}

const tones: Record<CardTone, string> = {
  default: 'border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-900',
  accent:
    'border-accent-200 bg-accent-50/60 dark:border-accent-900/50 dark:bg-accent-950/20',
  locked:
    'border-dashed border-stone-300 bg-stone-100/50 dark:border-stone-700 dark:bg-stone-900/40',
};

const paddings = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
} as const;

export function Card({
  tone = 'default',
  hoverable = false,
  padding = 'md',
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'rounded-2xl border shadow-soft',
        tones[tone],
        paddings[padding],
        hoverable
          ? 'transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift active:translate-y-0 active:shadow-soft dark:hover:border-accent-800'
          : '',
        className,
      ].join(' ')}
      {...rest}
    />
  );
}
