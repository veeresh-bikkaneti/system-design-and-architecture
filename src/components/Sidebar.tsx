import { NavLink } from 'react-router-dom';
import { lessons, tierLabels, tierOrder } from '../lib/lessons';
import { isTierUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';

export function Sidebar() {
  const completedLessons = useProgressStore((state) => state.completedLessons);
  const total = lessons.length;
  const completedCount = completedLessons.length;
  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <nav className="flex h-full w-full flex-col gap-6 overflow-y-auto p-4">
      <div className="flex flex-col gap-3">
        <NavLink to="/" className="px-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          System Design Mastery
        </NavLink>

        <div className="px-2">
          <div
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Overall course progress"
            className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          >
            <div
              className="h-full rounded-full bg-violet-600 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {completedCount} / {total} lessons ({percent}%)
          </p>
        </div>
      </div>

      {tierOrder.map((tier) => {
        const tierLessons = lessons.filter((lesson) => lesson.meta.tier === tier);
        if (tierLessons.length === 0) return null;

        const unlocked = isTierUnlocked(tier, completedLessons);

        return (
          <div key={tier}>
            <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {tierLabels[tier]}
            </h3>
            <ul className="space-y-1">
              {tierLessons.map((lesson) => {
                const completed = completedLessons.includes(lesson.meta.slug);

                if (!unlocked) {
                  return (
                    <li key={lesson.meta.slug}>
                      <span
                        aria-disabled="true"
                        className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-400 dark:text-slate-600"
                      >
                        <span aria-hidden="true">🔒</span>
                        <span className="truncate">{lesson.meta.title}</span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={lesson.meta.slug}>
                    <NavLink
                      to={`/lesson/${lesson.meta.slug}`}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? 'bg-violet-100 font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-100'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                        }`
                      }
                    >
                      {completed && (
                        <span className="shrink-0 text-green-600 dark:text-green-400" aria-hidden="true">
                          ✓
                        </span>
                      )}
                      <span className="truncate">{lesson.meta.title}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
