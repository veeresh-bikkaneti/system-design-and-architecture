import { Link, Navigate, useParams } from 'react-router-dom';
import { getLessonBySlug, lessons } from '../lib/lessons';
import { isLessonUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';

export function LessonPage() {
  const { slug } = useParams<{ slug: string }>();
  const lesson = slug ? getLessonBySlug(slug) : undefined;

  const completedLessons = useProgressStore((state) => state.completedLessons);
  const markComplete = useProgressStore((state) => state.markComplete);
  const markIncomplete = useProgressStore((state) => state.markIncomplete);

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
    <article>
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
          {lesson.meta.tier} · {lesson.meta.estimatedMinutes} min
        </p>

        <button
          type="button"
          onClick={() => (completed ? markIncomplete(lesson.meta.slug) : markComplete(lesson.meta.slug))}
          className={`inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            completed
              ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900'
              : 'bg-violet-600 text-white hover:bg-violet-700'
          }`}
        >
          {completed ? 'Completed ✓' : 'Mark as complete'}
        </button>
      </div>

      <div className="lesson-prose mt-2">
        <Component />
      </div>

      <div className="mt-12 flex items-center justify-between border-t border-slate-200 pt-6 dark:border-slate-800">
        {prevLesson ? (
          <Link
            to={`/lesson/${prevLesson.meta.slug}`}
            className="text-sm text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
          >
            ← {prevLesson.meta.title}
          </Link>
        ) : (
          <span />
        )}
        {nextLesson ? (
          <Link
            to={`/lesson/${nextLesson.meta.slug}`}
            className="text-sm text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
          >
            {nextLesson.meta.title} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </article>
  );
}
