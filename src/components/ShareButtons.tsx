import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon';
import {
  canNativeShare,
  copyToClipboard,
  linkedInIntentUrl,
  xIntentUrl,
} from '../lib/share';

const buttonClass =
  'inline-flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-white px-3.5 py-2 text-sm font-semibold text-stone-600 shadow-soft transition-colors hover:border-accent-300 hover:text-accent-800 active:translate-y-px dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-accent-800 dark:hover:text-accent-300';

/**
 * Share row for lesson pages: native share sheet where available (mobile),
 * copy-link with clipboard fallback, and X / LinkedIn intent links.
 *
 * Everything is a plain link or button — no SDKs, no tracking pixels, no
 * backend. The `url` prop must be the page's absolute canonical URL (the
 * same one `Seo` computes), because intent URLs shared from a relative
 * path would resolve against the sharer's context, not the lesson.
 */
export function ShareButtons({ title, url }: { title: string; url: string }) {
  // Lazily initialized: `navigator` exists in every render environment here
  // (client-only SPA, no SSR), so no effect is needed to detect it.
  const [nativeShare] = useState(() => canNativeShare());
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title, text: title, url });
    } catch {
      // User dismissed the sheet, or the share failed — the copy-link
      // button next to it is the fallback. Never surface an error here.
    }
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(url);
    if (!ok) return;
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-semibold text-stone-500 dark:text-stone-400">
        Share this lesson
      </span>
      {nativeShare && (
        <button type="button" onClick={handleNativeShare} className={buttonClass}>
          <Icon name="share" className="h-4 w-4" />
          Share
        </button>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className={buttonClass}
        aria-live="polite"
      >
        <Icon name={copied ? 'check' : 'link'} className="h-4 w-4" />
        {copied ? 'Copied!' : 'Copy link'}
      </button>
      <a
        href={xIntentUrl(url, title)}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
        aria-label={`Post "${title}" on X`}
      >
        Post on X
      </a>
      <a
        href={linkedInIntentUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
        aria-label={`Share "${title}" on LinkedIn`}
      >
        LinkedIn
      </a>
    </div>
  );
}
