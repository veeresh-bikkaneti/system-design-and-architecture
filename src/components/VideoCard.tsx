import { useState } from 'react';
import { Icon } from './ui/Icon';

/**
 * Curated-video card for MDX lessons. Replaces inline `🎥` markdown links
 * (which navigated readers *away* from the lesson) with a rich card that
 * opens YouTube in a new tab — the lesson stays put.
 *
 * Props come from the VideoCard codemod over content/lessons/*.mdx; the
 * videoId/title/source/description are exactly the lesson's original
 * values — only the presentation changed.
 */

export interface VideoCardProps {
  videoId: string;
  title: string;
  source: string;
  description?: string;
  /** `compact` is used for the "Go deeper" reading lists. */
  variant?: 'default' | 'compact';
}

export function VideoCard({ videoId, title, source, description, variant = 'default' }: VideoCardProps) {
  const [imgOk, setImgOk] = useState(true);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  if (variant === 'compact') {
    return (
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Watch on YouTube: ${title}`}
        className="not-prose group my-3 flex items-center gap-3.5 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-soft transition-[transform,box-shadow,border-color] no-underline! hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800"
      >
        <span className="relative block h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800">
          {imgOk && (
            <img
              src={thumbUrl}
              alt=""
              loading="lazy"
              onError={() => setImgOk(false)}
              className="h-full w-full object-cover"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-stone-950/25 transition-colors group-hover:bg-stone-950/10">
            <Icon name="play" className="h-5 w-5 text-white drop-shadow" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold tracking-tight text-stone-900 underline decoration-accent-300 decoration-2 underline-offset-4 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-xs">
            <span className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 dark:text-accent-400">
              {source}
            </span>
            {description && (
              <span className="text-stone-500 dark:text-stone-400">{` — ${description}`}</span>
            )}
          </span>
        </span>
        <Icon
          name="external"
          className="h-4 w-4 shrink-0 text-stone-300 transition-colors group-hover:text-accent-600 dark:text-stone-600 dark:group-hover:text-accent-400"
        />
      </a>
    );
  }

  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch on YouTube: ${title}`}
      className="not-prose group my-5 block overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft transition-[transform,box-shadow,border-color] no-underline! hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800"
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-stone-100 dark:bg-stone-800">
        {imgOk && (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            onError={() => setImgOk(false)}
            className="h-full w-full object-cover"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-stone-950/20 transition-colors group-hover:bg-stone-950/10">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-600/95 text-white shadow-lift transition-transform group-hover:scale-110 dark:bg-accent-500 dark:text-stone-950">
            <Icon name="play" className="ml-0.5 h-6 w-6" />
          </span>
        </span>
      </span>
      <span className="block p-4 sm:p-5">
        <span className="flex items-start justify-between gap-3">
          <span className="font-semibold tracking-tight text-stone-950 underline decoration-accent-300 decoration-2 underline-offset-4 group-hover:text-accent-800 dark:text-stone-50 dark:group-hover:text-accent-300">
            {title}
          </span>
          <Icon
            name="external"
            className="mt-1 h-4 w-4 shrink-0 text-stone-300 transition-colors group-hover:text-accent-600 dark:text-stone-600 dark:group-hover:text-accent-400"
          />
        </span>
        <span className="mt-1 block text-xs font-semibold uppercase tracking-wider text-accent-700 underline decoration-accent-300 underline-offset-2 dark:text-accent-400">
          {source} · YouTube
        </span>
        {description && (
          <span className="mt-2 block text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            {description}
          </span>
        )}
      </span>
    </a>
  );
}
