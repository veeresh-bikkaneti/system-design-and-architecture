import { useState } from 'react';
import { Icon } from './ui/Icon';

/**
 * Curated-video card for MDX lessons. Videos play inline: clicking the
 * thumbnail swaps in a privacy-enhanced YouTube embed (youtube-nocookie)
 * on the same page — no new tab. A "Watch on YouTube" link stays available
 * for the full YouTube page.
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

/**
 * YouTube video IDs are exactly 11 chars of [A-Za-z0-9_-]. Anything else
 * never goes into an iframe src — the card degrades to the old new-tab link.
 */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const EMBED_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

function PlayerFrame({ videoId, title }: { videoId: string; title: string }) {
  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
      title={title}
      allow={EMBED_ALLOW}
      allowFullScreen
      className="aspect-video h-full w-full border-0"
    />
  );
}

function WatchOnYouTube({ watchUrl, title }: { watchUrl: string; title: string }) {
  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch on YouTube: ${title}`}
      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 underline decoration-accent-300 decoration-2 underline-offset-4 hover:text-accent-800 dark:text-accent-400 dark:hover:text-accent-300"
    >
      Watch on YouTube
      <Icon name="external" className="h-3.5 w-3.5" />
    </a>
  );
}

export function VideoCard({ videoId, title, source, description, variant = 'default' }: VideoCardProps) {
  const [imgOk, setImgOk] = useState(true);
  const [playing, setPlaying] = useState(false);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const canEmbed = YOUTUBE_ID_RE.test(videoId);

  const sourceLine = (
    <span className="mt-1 block text-xs font-semibold uppercase tracking-wider text-accent-700 dark:text-accent-400">
      {source} · YouTube
    </span>
  );

  if (variant === 'compact') {
    return (
      <div className="not-prose group my-3 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft transition-[border-color,box-shadow] hover:border-accent-300 hover:shadow-lift dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800">
        {playing ? (
          <div className="aspect-video w-full bg-stone-950">
            <PlayerFrame videoId={videoId} title={title} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => (canEmbed ? setPlaying(true) : window.open(watchUrl, '_blank', 'noopener'))}
            aria-label={`Play video: ${title}`}
            className="flex w-full cursor-pointer items-center gap-3.5 p-3 text-left"
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
          </button>
        )}
        {playing && (
          <div className="px-4 pb-3 pt-1">
            <span className="block truncate text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {title}
            </span>
            {sourceLine}
            <WatchOnYouTube watchUrl={watchUrl} title={title} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="not-prose group my-5 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800">
      {playing ? (
        <div className="aspect-video w-full bg-stone-950">
          <PlayerFrame videoId={videoId} title={title} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (canEmbed ? setPlaying(true) : window.open(watchUrl, '_blank', 'noopener'))}
          aria-label={`Play video: ${title}`}
          className="relative block aspect-video w-full cursor-pointer overflow-hidden bg-stone-100 dark:bg-stone-800"
        >
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
        </button>
      )}
      <div className="block p-4 sm:p-5">
        <span className="block font-semibold tracking-tight text-stone-950 underline decoration-accent-300 decoration-2 underline-offset-4 group-hover:text-accent-800 dark:text-stone-50 dark:group-hover:text-accent-300">
          {title}
        </span>
        {sourceLine}
        {description && (
          <span className="mt-2 block text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            {description}
          </span>
        )}
        <WatchOnYouTube watchUrl={watchUrl} title={title} />
      </div>
    </div>
  );
}
