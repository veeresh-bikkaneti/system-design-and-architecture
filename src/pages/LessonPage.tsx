import { Link, Navigate, useParams } from 'react-router-dom';
import { getLessonBySlug, lessons } from '../lib/lessons';

export function LessonPage() {
  const { slug } = useParams<{ slug: string }>();
  const lesson = slug ? getLessonBySlug(slug) : undefined;

  if (!lesson) {
    return <Navigate to="/" replace />;
  }

  const index = lessons.findIndex((l) => l.meta.slug === lesson.meta.slug);
  const prevLesson = index > 0 ? lessons[index - 1] : undefined;
  const nextLesson = index < lessons.length - 1 ? lessons[index + 1] : undefined;

  const { Component } = lesson;

  return (
    <article>
      <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
        {lesson.meta.tier} · {lesson.meta.estimatedMinutes} min
      </p>

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
