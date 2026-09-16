/**
 * The one progress bar. Single `role="progressbar"` implementation —
 * replaces the five hand-rolled progress surfaces (sidebar, home rings,
 * tier cards, roadmap rail bits, quiz header).
 */

export interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function ProgressBar({ value, max, label, size = 'sm', className = '' }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={`${size === 'sm' ? 'h-1.5' : 'h-2'} w-full overflow-hidden rounded-full bg-stone-200/80 dark:bg-stone-800 ${className}`}
    >
      <div
        className="h-full rounded-full bg-accent-500 transition-[width] duration-500 dark:bg-accent-400"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
