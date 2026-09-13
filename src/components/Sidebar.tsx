import { NavLink } from 'react-router-dom';
import { lessons, tierLabels, tierOrder, type Tier } from '../lib/lessons';
import { getBadgesWithStatus } from '../lib/badges';
import { isTierUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';

/* Small inline SVG icon set (no emoji iconography) — shared with pages. */
function iconProps(className?: string) {
  return {
    className,
    fill: 'none',
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    stroke: 'currentColor',
    'aria-hidden': true,
  } as const;
}

export function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps(className)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function LockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps(className)} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

export function ClockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps(className)} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export function ArrowRightIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps(className)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowLeftIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps(className)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function MedalIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps(className)} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="15" r="6" />
      <path d="M15.5 9.5L20 3h-4l-2.5 5M8.5 9.5L4 3h4l2.5 5" />
    </svg>
  );
}

export function HomeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps(className)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}

export function MapIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...iconProps(className)} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

const lessonLinkBase =
  'group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors';

function lessonLinkState(isActive: boolean) {
  return isActive
    ? 'bg-accent-100 font-semibold text-accent-900 dark:bg-accent-950/70 dark:text-accent-200'
    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950 active:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100 dark:active:bg-stone-800';
}

function TierProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80 dark:bg-stone-800"
      role="presentation"
    >
      <div
        className="h-full rounded-full bg-accent-500 transition-all duration-500 dark:bg-accent-400"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function Sidebar() {
  const completedLessons = useProgressStore((state) => state.completedLessons);
  const quizResults = useProgressStore((state) => state.quizResults);

  const total = lessons.length;
  const completedCount = completedLessons.length;
  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const badgeStatuses = getBadgesWithStatus({ completedLessons, quizResults });
  const unlockedBadgeCount = badgeStatuses.filter((badge) => badge.unlocked).length;

  return (
    <nav aria-label="Course" className="flex h-full w-full flex-col gap-6 overflow-y-auto p-4">
      {/* Overall progress */}
      <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Your progress
          </p>
          <p className="font-display text-2xl font-semibold text-stone-950 dark:text-stone-50">
            {percent}
            <span className="text-sm font-medium text-stone-400">%</span>
          </p>
        </div>
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Overall course progress"
            className="h-2 w-full overflow-hidden rounded-full bg-stone-200/80 dark:bg-stone-800"
          >
            <div
              className="h-full rounded-full bg-accent-500 transition-all duration-500 dark:bg-accent-400"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            {completedCount} of {total} lessons complete
          </p>
        </div>
      </div>

      {/* Primary nav */}
      <div className="flex flex-col gap-1">
        <NavLink to="/" end className={({ isActive }) => `${lessonLinkBase} ${lessonLinkState(isActive)}`}>
          <HomeIcon />
          <span>Home</span>
        </NavLink>
        <NavLink
          to="/roadmap"
          className={({ isActive }) => `${lessonLinkBase} ${lessonLinkState(isActive)}`}
        >
          <MapIcon />
          <span>Roadmap</span>
        </NavLink>
        <NavLink
          to="/badges"
          className={({ isActive }) => `${lessonLinkBase} ${lessonLinkState(isActive)}`}
        >
          <MedalIcon />
          <span>Badges</span>
          <span className="ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {unlockedBadgeCount}/{badgeStatuses.length}
          </span>
        </NavLink>
      </div>

      {/* Tiered lesson navigation */}
      {tierOrder.map((tier: Tier) => {
        const tierLessons = lessons.filter((lesson) => lesson.meta.tier === tier);
        if (tierLessons.length === 0) return null;

        const unlocked = isTierUnlocked(tier, completedLessons);
        const tierCompleted = tierLessons.filter((l) => completedLessons.includes(l.meta.slug)).length;
        const tierPercent = Math.round((tierCompleted / tierLessons.length) * 100);

        return (
          <section key={tier} aria-label={tierLabels[tier]}>
            <div className="px-3 pb-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {tierLabels[tier]}
                </h3>
                <span className="text-xs font-medium tabular-nums text-stone-400 dark:text-stone-500">
                  {tierCompleted}/{tierLessons.length}
                </span>
              </div>
              <div className="mt-2">
                <TierProgressBar percent={tierPercent} />
              </div>
            </div>
            <ul className="space-y-0.5">
              {tierLessons.map((lesson) => {
                const completed = completedLessons.includes(lesson.meta.slug);

                if (!unlocked) {
                  return (
                    <li key={lesson.meta.slug}>
                      <span
                        aria-disabled="true"
                        title="Complete the previous tier to unlock"
                        className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-stone-400 dark:text-stone-600"
                      >
                        <LockIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{lesson.meta.title}</span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={lesson.meta.slug}>
                    <NavLink
                      to={`/lesson/${lesson.meta.slug}`}
                      className={({ isActive }) => `${lessonLinkBase} ${lessonLinkState(isActive)}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          completed
                            ? 'border-accent-600 bg-accent-600 text-white dark:border-accent-400 dark:bg-accent-400 dark:text-stone-950'
                            : 'border-stone-300 text-transparent dark:border-stone-700'
                        }`}
                      >
                        <CheckIcon className="h-3 w-3" />
                      </span>
                      <span className="truncate">{lesson.meta.title}</span>
                      {completed && <span className="sr-only">(completed)</span>}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
