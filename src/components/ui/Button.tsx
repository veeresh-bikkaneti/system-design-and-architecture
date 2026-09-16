import type { ButtonHTMLAttributes } from 'react';

/**
 * The one button. `primary` is the single call-to-action recipe for the
 * whole site: one hover physics (lift + shadow-lift), one active state,
 * one disabled treatment. `secondary` and `ghost` cover everything else.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold ' +
  'transition-[transform,box-shadow,background-color,color,border-color] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 ' +
  'active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:shadow-none';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-700 text-white shadow-soft hover:-translate-y-0.5 hover:bg-accent-800 hover:shadow-lift ' +
    'dark:bg-accent-400 dark:text-stone-950 dark:hover:bg-accent-300 ' +
    'disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-stone-700 dark:disabled:text-stone-400',
  secondary:
    'border border-stone-300 bg-white text-stone-700 shadow-soft ' +
    'hover:-translate-y-0.5 hover:border-accent-300 hover:bg-amber-50/60 hover:text-accent-900 hover:shadow-lift ' +
    'dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 ' +
    'dark:hover:border-accent-700 dark:hover:bg-accent-950/30 dark:hover:text-accent-200 ' +
    'disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 ' +
    'dark:disabled:border-stone-800 dark:disabled:bg-stone-900 dark:disabled:text-stone-600',
  ghost:
    'text-stone-600 hover:bg-stone-200/60 hover:text-stone-950 ' +
    'dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-50 ' +
    'disabled:text-stone-400 dark:disabled:text-stone-600',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...rest}
    />
  );
}

/** The same recipe for anchors that should look like buttons (e.g. React
 * Router Links). One source of truth — never restyle a primary CTA by hand. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = '',
) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}
