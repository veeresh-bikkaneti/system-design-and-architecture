import { Link } from 'react-router-dom';
import { lessons, tierLabels, tierOrder } from '../lib/lessons';
import { isTierUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';

export function HomePage() {
  const firstLesson = lessons[0];
  const completedLessons = useProgressStore((state) => state.completedLessons);

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
        {tierOrder.map((tier, tierIndex) => {
          const tierLessons = lessons.filter((lesson) => lesson.meta.tier === tier);
          if (tierLessons.length === 0) return null;

          const unlocked = isTierUnlocked(tier, completedLessons);
          const previousTier = tierIndex > 0 ? tierOrder[tierIndex - 1] : undefined;

          return (
            <section key={tier}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {tierLabels[tier]}
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {tierLessons.map((lesson) => {
                  const completed = completedLessons.includes(lesson.meta.slug);

                  if (!unlocked) {
                    return (
                      <li key={lesson.meta.slug}>
                        <div
                          aria-disabled="true"
                          className="block cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 p-4 opacity-60 dark:border-slate-800 dark:bg-slate-900/40"
                        >
                          <h3 className="flex items-center gap-2 font-medium text-slate-500 dark:text-slate-500">
                            <span aria-hidden="true">🔒</span>
                            {lesson.meta.title}
                          </h3>
                          <p className="mt-1 text-sm text-slate-400 dark:text-slate-600">
                            {lesson.meta.summary}
                          </p>
                          {previousTier && (
                            <p className="mt-2 text-xs font-medium text-slate-400 dark:text-slate-600">
                              Complete the {tierLabels[previousTier]} lessons to unlock
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li key={lesson.meta.slug}>
                      <Link
                        to={`/lesson/${lesson.meta.slug}`}
                        className="block rounded-lg border border-slate-200 p-4 transition-colors hover:border-violet-300 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:border-violet-800 dark:hover:bg-violet-950/30"
                      >
                        <h3 className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                          {completed && (
                            <span className="text-green-600 dark:text-green-400" aria-hidden="true">
                              ✓
                            </span>
                          )}
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
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
