import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLessonBySlug, lessons, tierLabels, tierOrder } from '../lib/lessons';
import type { Tier } from '../lib/lessons';
import { isLessonUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';
import { Icon } from '../components/ui/Icon';
import { Button } from '../components/ui/Button';
import { HeadingsProvider, OnThisPage } from '../components/OnThisPage';

/** Thin reading-progress bar pinned to the top of the viewport. */
function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-transparent"
      aria-hidden="true"
    >
      <div
        className="h-full bg-accent-500 transition-[width] duration-100 ease-out dark:bg-accent-400"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

function CompleteButton({ slug, completed }: { slug: string; completed: boolean }) {
  const markComplete = useProgressStore((state) => state.markComplete);
  const markIncomplete = useProgressStore((state) => state.markIncomplete);

  if (completed) {
    return (
      <button
        type="button"
        onClick={() => markIncomplete(slug)}
        aria-pressed={completed}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent-100 px-4 py-2.5 text-sm font-semibold text-accent-900 shadow-soft transition-colors hover:bg-accent-200 active:bg-accent-300 dark:bg-accent-950/70 dark:text-accent-200 dark:hover:bg-accent-900/60 dark:active:bg-accent-900"
      >
        <Icon name="check" className="h-4 w-4" />
        Completed
      </button>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => markComplete(slug)}
      aria-pressed={completed}
      className="shrink-0"
    >
      Mark as complete
    </Button>
  );
}

/** Home / Tier / Lesson — so readers always know where they stand. */
function Breadcrumb({ tier, title }: { tier: Tier; title: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-stone-400 dark:text-stone-500">
        <li>
          <Link to="/" className="rounded transition-colors hover:text-accent-700 dark:hover:text-accent-300">
            Home
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>{tierLabels[tier]}</li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="truncate text-stone-600 dark:text-stone-300">
          {title}
        </li>
      </ol>
    </nav>
  );
}

/**
 * Subtle warm wash behind the lesson header, tinted by tier — beginners get
 * the gentlest wash, advanced lessons the deepest. Stays in the site's
 * amber/stone identity; no generic gradient clichés.
 */
const tierTint: Record<Tier, string> = {
  beginner:
    'from-accent-100/70 via-accent-50/40 dark:from-accent-950/50 dark:via-accent-950/20',
  intermediate:
    'from-accent-200/50 via-accent-100/25 dark:from-accent-900/40 dark:via-accent-950/15',
  advanced:
    'from-accent-300/40 via-accent-200/15 dark:from-accent-800/30 dark:via-accent-950/10',
};

/** Shown instead of silently bouncing home when a lesson can't be opened. */
function LessonGate({
  title,
  heading,
  body,
}: {
  title: string;
  heading: string;
  body: string;
}) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center sm:py-24">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-stone-200 bg-white shadow-soft dark:border-stone-800 dark:bg-stone-900">
        <Icon name="lock" className="h-7 w-7 text-stone-400 dark:text-stone-500" />
      </div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-accent-700 dark:text-accent-400">
        {title}
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
        {heading}
      </h1>
      <p className="mx-auto mt-4 max-w-md leading-relaxed text-stone-600 dark:text-stone-400">
        {body}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/roadmap"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-700 px-6 py-3 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-accent-800 dark:bg-accent-400 dark:text-stone-950 dark:hover:bg-accent-300"
        >
          View the roadmap
        </Link>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 shadow-soft transition-colors hover:border-accent-300 hover:text-accent-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-accent-800 dark:hover:text-accent-300"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

export function LessonPage() {
  const { slug } = useParams<{ slug: string }>();
  const lesson = slug ? getLessonBySlug(slug) : undefined;

  const completedLessons = useProgressStore((state) => state.completedLessons);

  // Reset scroll to top when moving between lessons.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [slug]);

  if (!lesson) {
    return (
      <LessonGate
        title="Not found"
        heading="There's no lesson at this address."
        body="The link may be mistyped, or the lesson may have moved. The roadmap lists every lesson in the course."
      />
    );
  }

  if (!isLessonUnlocked(lesson.meta.slug, completedLessons)) {
    const tierIndex = tierOrder.indexOf(lesson.meta.tier);
    const previousTier = tierIndex > 0 ? tierLabels[tierOrder[tierIndex - 1]] : null;
    return (
      <LessonGate
        title="Locked lesson"
        heading={`"${lesson.meta.title}" unlocks later in the course.`}
        body={
          previousTier
            ? `This is a ${tierLabels[lesson.meta.tier]}-tier lesson. Complete every lesson in the ${previousTier} tier to unlock it — your progress is saved as you go.`
            : 'Complete the earlier lessons to unlock it — your progress is saved as you go.'
        }
      />
    );
  }

  const index = lessons.findIndex((l) => l.meta.slug === lesson.meta.slug);
  const prevLesson = index > 0 ? lessons[index - 1] : undefined;
  const nextLesson = index < lessons.length - 1 ? lessons[index + 1] : undefined;

  const { Component } = lesson;
  const completed = completedLessons.includes(lesson.meta.slug);

  return (
    <HeadingsProvider key={lesson.meta.slug}>
      <div className="mx-auto max-w-5xl xl:max-w-6xl">
        <ReadingProgressBar />

        {/* On xl screens: article + sticky "On this page" rail. */}
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_12rem] xl:gap-12">
          <article className="min-w-0">
            <Breadcrumb tier={lesson.meta.tier} title={lesson.meta.title} />

            {/* Lesson hero */}
            <header
              className={`mt-4 rounded-3xl border border-stone-200/70 bg-gradient-to-br to-transparent p-5 shadow-soft sm:p-8 dark:border-stone-800 ${tierTint[lesson.meta.tier]}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-800 dark:bg-accent-950/70 dark:text-accent-300">
                  {tierLabels[lesson.meta.tier]}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-200/70 px-3 py-1 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  {lesson.meta.estimatedMinutes} min read
                </span>
              </div>

              <h1 className="mt-4 font-display text-3xl font-semibold leading-[1.08] tracking-tight text-stone-950 text-balance sm:text-5xl dark:text-stone-50">
                {lesson.meta.title}
              </h1>

              <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-stone-600 dark:text-stone-400">
                {lesson.meta.summary}
              </p>

              <div className="mt-6">
                <CompleteButton slug={lesson.meta.slug} completed={completed} />
              </div>
            </header>

            {/* Lesson body at a comfortable reading measure */}
            <div className="lesson-prose mt-10 max-w-[65ch]">
              <Component />
            </div>

            {/* Completion + prev/next */}
            <footer className="mt-14 max-w-[65ch]">
              <div className="rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-soft dark:border-stone-800 dark:bg-stone-900">
                <p className="font-display text-xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
                  {completed ? 'Lesson complete — well done.' : 'Finished reading?'}
                </p>
                <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
                  {completed
                    ? 'You can revisit it any time, or keep going.'
                    : 'Mark it complete to unlock your next lessons and earn badges.'}
                </p>
                <div className="mt-4">
                  <CompleteButton slug={lesson.meta.slug} completed={completed} />
                </div>
              </div>

              <nav aria-label="Lesson navigation" className="mt-6 grid gap-3 sm:grid-cols-2">
                {prevLesson ? (
                  <Link
                    to={`/lesson/${prevLesson.meta.slug}`}
                    className="group rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift active:translate-y-0 active:shadow-soft dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      <Icon name="arrowLeft" className="h-3.5 w-3.5" />
                      Previous
                    </span>
                    <span className="mt-1.5 block font-semibold tracking-tight text-stone-900 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">
                      {prevLesson.meta.title}
                    </span>
                  </Link>
                ) : (
                  <span aria-hidden="true" />
                )}
                {nextLesson ? (
                  <Link
                    to={`/lesson/${nextLesson.meta.slug}`}
                    className="group rounded-2xl border border-stone-200/80 bg-white p-4 text-right shadow-soft transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift active:translate-y-0 active:shadow-soft dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800"
                  >
                    <span className="flex items-center justify-end gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      Next
                      <Icon name="arrowRight" className="h-3.5 w-3.5" />
                    </span>
                    <span className="mt-1.5 block font-semibold tracking-tight text-stone-900 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">
                      {nextLesson.meta.title}
                    </span>
                  </Link>
                ) : (
                  <span aria-hidden="true" />
                )}
              </nav>
            </footer>
          </article>

          <OnThisPage />
        </div>
      </div>
    </HeadingsProvider>
  );
}
