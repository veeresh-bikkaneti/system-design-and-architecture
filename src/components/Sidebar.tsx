import { NavLink } from 'react-router-dom';
import { lessons, tierLabels, tierOrder } from '../lib/lessons';

export function Sidebar() {
  return (
    <nav className="flex h-full w-full flex-col gap-6 overflow-y-auto p-4">
      <NavLink to="/" className="px-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
        System Design Mastery
      </NavLink>

      {tierOrder.map((tier) => {
        const tierLessons = lessons.filter((lesson) => lesson.meta.tier === tier);
        if (tierLessons.length === 0) return null;

        return (
          <div key={tier}>
            <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {tierLabels[tier]}
            </h3>
            <ul className="space-y-1">
              {tierLessons.map((lesson) => (
                <li key={lesson.meta.slug}>
                  <NavLink
                    to={`/lesson/${lesson.meta.slug}`}
                    className={({ isActive }) =>
                      `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-violet-100 font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-100'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                      }`
                    }
                  >
                    {lesson.meta.title}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
