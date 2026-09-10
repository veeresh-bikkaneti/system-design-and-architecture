import { Link } from 'react-router-dom';
import { lessons, tierLabels, tierOrder } from '../lib/lessons';

export function HomePage() {
  const firstLesson = lessons[0];

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        System Design Mastery
      </h1>
      <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
        A progressive, self-paced course covering system design from first principles to
        interview-ready depth — with an AI tutor that can sketch the architecture diagrams for
        you as you go.
      </p>

      {firstLesson && (
        <Link
          to={`/lesson/${firstLesson.meta.slug}`}
          className="mt-6 inline-flex items-center rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          Start with "{firstLesson.meta.title}"
        </Link>
      )}

      <div className="mt-10 space-y-8">
        {tierOrder.map((tier) => {
          const tierLessons = lessons.filter((lesson) => lesson.meta.tier === tier);
          if (tierLessons.length === 0) return null;

          return (
            <section key={tier}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {tierLabels[tier]}
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {tierLessons.map((lesson) => (
                  <li key={lesson.meta.slug}>
                    <Link
                      to={`/lesson/${lesson.meta.slug}`}
                      className="block rounded-lg border border-slate-200 p-4 transition-colors hover:border-violet-300 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:border-violet-800 dark:hover:bg-violet-950/30"
                    >
                      <h3 className="font-medium text-slate-900 dark:text-slate-100">
                        {lesson.meta.title}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {lesson.meta.summary}
                      </p>
                      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        {lesson.meta.estimatedMinutes} min
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
