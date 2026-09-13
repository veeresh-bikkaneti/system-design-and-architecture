import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getLessonBySlug, lessons, tierLabels } from '../lib/lessons';
import { isLessonUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
} from '../components/Sidebar';

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

  return (
    <button
      type="button"
      onClick={() => (completed ? markIncomplete(slug) : markComplete(slug))}
      aria-pressed={completed}
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-soft transition-colors ${
        completed
          ? 'bg-accent-100 text-accent-900 hover:bg-accent-200 active:bg-accent-300 dark:bg-accent-950/70 dark:text-accent-200 dark:hover:bg-accent-900/60 dark:active:bg-accent-900'
          : 'bg-accent-700 text-white hover:bg-accent-800 active:bg-accent-900 dark:bg-accent-400 dark:text-stone-950 dark:hover:bg-accent-300 dark:active:bg-accent-200'
      }`}
    >
      {completed && <CheckIcon className="h-4 w-4" />}
      {completed ? 'Completed' : 'Mark as complete'}
    </button>
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
    return <Navigate to="/" replace />;
  }

  if (!isLessonUnlocked(lesson.meta.slug, completedLessons)) {
    return <Navigate to="/" replace />;
  }

  const index = lessons.findIndex((l) => l.meta.slug === lesson.meta.slug);
  const prevLesson = index > 0 ? lessons[index - 1] : undefined;
  const nextLesson = index < lessons.length - 1 ? lessons[index + 1] : undefined;

  const { Component } = lesson;
  const completed = completedLessons.includes(lesson.meta.slug);

  return (
    <article className="mx-auto max-w-5xl">
      <ReadingProgressBar />

      {/* Lesson hero */}
      <header className="max-w-[65ch]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-800 dark:bg-accent-950/70 dark:text-accent-300">
            {tierLabels[lesson.meta.tier]}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-200/70 px-3 py-1 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            <ClockIcon className="h-3.5 w-3.5" />
            {lesson.meta.estimatedMinutes} min read
          </span>
        </div>

        <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-stone-950 text-balance sm:text-5xl dark:text-stone-50">
          {lesson.meta.title}
        </h1>

        <p className="mt-4 text-lg leading-relaxed text-stone-600 dark:text-stone-400">
          {lesson.meta.summary}
        </p>

        <div className="mt-6">
          <CompleteButton slug={lesson.meta.slug} completed={completed} />
        </div>
      </header>

      <hr className="my-8 border-stone-200 dark:border-stone-800" />

      {/* Lesson body at a comfortable reading measure */}
      <div className="lesson-prose max-w-[65ch]">
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
              className="group rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift active:translate-y-0 active:shadow-soft dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                <ArrowLeftIcon className="h-3.5 w-3.5" />
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
              className="group rounded-2xl border border-stone-200/80 bg-white p-4 text-right shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift active:translate-y-0 active:shadow-soft dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800"
            >
              <span className="flex items-center justify-end gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                Next
                <ArrowRightIcon className="h-3.5 w-3.5" />
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
  );
}
