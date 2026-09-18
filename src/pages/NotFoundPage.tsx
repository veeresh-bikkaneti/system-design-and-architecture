import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { Seo } from '../components/Seo';

/** Catch-all for unknown routes: explains, then offers a way back. */
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center sm:py-24">
      <Seo
        title="Page not found | System Design Mastery"
        description="The address doesn't match anything in the course. Head back to familiar ground."
        path="/404"
      />
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-stone-200 bg-white shadow-soft dark:border-stone-800 dark:bg-stone-900">
        <Icon name="map" className="h-7 w-7 text-stone-400 dark:text-stone-500" />
      </div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-accent-700 dark:text-accent-400">
        Page not found
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
        This path leads nowhere.
      </h1>
      <p className="mx-auto mt-4 max-w-md leading-relaxed text-stone-600 dark:text-stone-400">
        The address doesn&apos;t match anything in the course. Head back to familiar
        ground — your progress is safe.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-700 px-6 py-3 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-accent-800 dark:bg-accent-400 dark:text-stone-950 dark:hover:bg-accent-300"
        >
          Back to home
        </Link>
        <Link
          to="/roadmap"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 shadow-soft transition-colors hover:border-accent-300 hover:text-accent-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-accent-800 dark:hover:text-accent-300"
        >
          View the roadmap
        </Link>
      </div>
    </div>
  );
}
