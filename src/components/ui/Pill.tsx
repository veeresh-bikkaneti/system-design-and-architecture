import type { HTMLAttributes } from 'react';

/** The one pill/badge label. Tones: accent / success / neutral. */

export type PillTone = 'accent' | 'success' | 'neutral';
export type PillSize = 'xs' | 'sm';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  size?: PillSize;
}

const tones: Record<PillTone, string> = {
  accent: 'bg-accent-100 text-accent-800 dark:bg-accent-950/70 dark:text-accent-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-300',
  neutral: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
};

const sizes: Record<PillSize, string> = {
  xs: 'px-2 py-0.5 text-xs',
  sm: 'px-3 py-1 text-xs',
};

export function Pill({ tone = 'neutral', size = 'xs', className = '', ...rest }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${tones[tone]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
}
