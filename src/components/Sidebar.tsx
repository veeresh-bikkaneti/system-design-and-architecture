import { NavLink } from 'react-router-dom';
import { lessons, tierLabels, tierOrder, type Tier } from '../lib/lessons';
import { getBadgesWithStatus } from '../lib/badges';
import { isTierUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';
import { Icon } from './ui/Icon';
import { ProgressBar } from './ui/ProgressBar';

/* Icon set — thin wrappers over the single ui/Icon set, kept so existing
   imports from '../components/Sidebar' keep working. New code should import
   { Icon } from './ui/Icon' directly. */
export function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Icon name="check" className={className} />;
}

export function LockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Icon name="lock" className={className} />;
}

export function ClockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Icon name="clock" className={className} />;
}

export function ArrowRightIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Icon name="arrowRight" className={className} />;
}

export function ArrowLeftIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Icon name="arrowLeft" className={className} />;
}

export function MedalIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Icon name="medal" className={className} />;
}

export function HomeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Icon name="home" className={className} />;
}

export function MapIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <Icon name="map" className={className} />;
}

const lessonLinkBase =
  'group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors';

function lessonLinkState(isActive: boolean) {
  return isActive
    ? 'bg-accent-100 font-semibold text-accent-900 dark:bg-accent-950/70 dark:text-accent-200'
    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950 active:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100 dark:active:bg-stone-800';
}

function TierProgressBar({ percent }: { percent: number }) {
  return <ProgressBar value={percent} max={100} label="Tier progress" />;
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
          <ProgressBar
            value={completedCount}
            max={total}
            label="Overall course progress"
            size="md"
          />
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
                <span className="text-xs font-medium tabular-nums text-stone-400 dark:text-stone-400">
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
                        <span className="line-clamp-2">{lesson.meta.title}</span>
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
                            ? 'border-accent-600 bg-accent-600 text-white dark:border-accent-300 dark:bg-accent-300 dark:text-stone-950'
                            : 'border-stone-300 text-transparent dark:border-stone-700'
                        }`}
                      >
                        <CheckIcon className="h-3 w-3" />
                      </span>
                      <span className="line-clamp-2">{lesson.meta.title}</span>
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
