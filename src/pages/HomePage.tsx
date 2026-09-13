import { Link } from 'react-router-dom';
import { lessons, tierLabels, tierOrder, type Tier } from '../lib/lessons';
import { getBadgesWithStatus } from '../lib/badges';
import { isLessonUnlocked, isTierUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';
import { ArrowRightIcon, CheckIcon, ClockIcon, LockIcon } from '../components/Sidebar';

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft dark:border-stone-800 dark:bg-stone-900">
      <p className="font-display text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
        {value}
      </p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{label}</p>
    </div>
  );
}

function TierCard({
  tier,
  index,
  completedCount,
  totalLessons,
}: {
  tier: Tier;
  index: number;
  completedCount: number;
  totalLessons: number;
}) {
  const percent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const complete = completedCount === totalLessons;

  return (
    <div className="relative rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft transition-shadow hover:shadow-lift dark:border-stone-800 dark:bg-stone-900">
      <p className="font-display text-4xl font-semibold text-accent-200 dark:text-accent-900/60">
        {String(index + 1).padStart(2, '0')}
      </p>
      <h3 className="mt-2 text-base font-semibold tracking-tight text-stone-950 dark:text-stone-50">
        {tierLabels[tier]}
      </h3>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        {totalLessons} lessons
      </p>
      <div className="mt-4">
        <div
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={totalLessons}
          aria-label={`${tierLabels[tier]} progress`}
          className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80 dark:bg-stone-800"
        >
          <div
            className="h-full rounded-full bg-accent-500 transition-all duration-500 dark:bg-accent-400"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-medium text-stone-500 dark:text-stone-400">
          {complete ? 'Complete — nice work' : `${completedCount} of ${totalLessons} done`}
        </p>
      </div>
    </div>
  );
}

export function HomePage() {
  const completedLessons = useProgressStore((state) => state.completedLessons);
  const quizResults = useProgressStore((state) => state.quizResults);

  // Continue where you left off: first unlocked lesson not yet completed.
  const nextLesson = lessons.find(
    (lesson) =>
      !completedLessons.includes(lesson.meta.slug) &&
      isLessonUnlocked(lesson.meta.slug, completedLessons),
  );
  const firstLesson = lessons[0];
  const continueLesson = nextLesson ?? firstLesson;
  const hasStarted = completedLessons.length > 0;

  const badgeStatuses = getBadgesWithStatus({ completedLessons, quizResults });
  const unlockedBadgeCount = badgeStatuses.filter((badge) => badge.unlocked).length;
  const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.meta.estimatedMinutes, 0);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <section className="pt-4 sm:pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-700 dark:text-accent-400">
          A self-paced course
        </p>
        <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-stone-950 sm:text-5xl dark:text-stone-50">
          System design, from first principles to interview-ready.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone-600 dark:text-stone-400">
          Learn how the systems you use every day actually work — caching, load balancing,
          databases, queues — through plain-language lessons, hand-drawn-style diagrams, and an
          AI tutor that can sketch the architecture for you as you go.
        </p>

        {/* Continue / start */}
        {continueLesson && (
          <div className="mt-8 rounded-2xl border border-accent-200 bg-accent-50 p-5 shadow-soft sm:p-6 dark:border-accent-900/60 dark:bg-accent-950/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-800 dark:text-accent-300">
                  {hasStarted ? 'Continue where you left off' : 'Start here'}
                </p>
                <p className="mt-1.5 font-display text-xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
                  {continueLesson.meta.title}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-500 dark:text-stone-400">
                  <ClockIcon className="h-3.5 w-3.5" />
                  {continueLesson.meta.estimatedMinutes} min · {tierLabels[continueLesson.meta.tier]}
                </p>
              </div>
              <Link
                to={`/lesson/${continueLesson.meta.slug}`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent-700 px-5 py-3 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-accent-800 active:bg-accent-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-accent-400 dark:text-stone-950 dark:hover:bg-accent-300 dark:active:bg-accent-200"
              >
                {hasStarted ? 'Continue lesson' : 'Start learning'}
                <ArrowRightIcon />
              </Link>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard value={`${completedLessons.length}/${lessons.length}`} label="Lessons completed" />
          <StatCard value={`${totalMinutes}`} label="Minutes of content" />
          <StatCard value={`${unlockedBadgeCount}/${badgeStatuses.length}`} label="Badges earned" />
          <StatCard value="3" label="Skill tiers" />
        </div>
      </section>

      {/* Tier roadmap */}
      <section className="mt-14" aria-label="Course roadmap">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
              Your roadmap
            </h2>
            <p className="mt-2 max-w-2xl text-stone-600 dark:text-stone-400">
              Three tiers, each unlocking the next. Finish every lesson in a tier to move up.
            </p>
          </div>
          <Link
            to="/roadmap"
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:text-accent-800 hover:shadow-lift dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-accent-800 dark:hover:text-accent-300"
          >
            See the animated journey
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {tierOrder.map((tier, tierIndex) => {
            const tierLessons = lessons.filter((lesson) => lesson.meta.tier === tier);
            if (tierLessons.length === 0) return null;
            const tierCompleted = tierLessons.filter((l) =>
              completedLessons.includes(l.meta.slug),
            ).length;
            return (
              <TierCard
                key={tier}
                tier={tier}
                index={tierIndex}
                completedCount={tierCompleted}
                totalLessons={tierLessons.length}
              />
            );
          })}
        </div>
      </section>

      {/* Lesson catalog */}
      <section className="mt-14" aria-label="All lessons">
        {tierOrder.map((tier, tierIndex) => {
          const tierLessons = lessons.filter((lesson) => lesson.meta.tier === tier);
          if (tierLessons.length === 0) return null;

          const unlocked = isTierUnlocked(tier, completedLessons);
          const previousTier = tierIndex > 0 ? tierOrder[tierIndex - 1] : undefined;
          const tierCompleted = tierLessons.filter((l) =>
            completedLessons.includes(l.meta.slug),
          ).length;

          return (
            <div key={tier} className="mb-12">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
                  {tierLabels[tier]}
                </h2>
                <span className="text-xs font-medium tabular-nums text-stone-400 dark:text-stone-500">
                  {tierCompleted}/{tierLessons.length}
                </span>
              </div>

              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {tierLessons.map((lesson) => {
                  const completed = completedLessons.includes(lesson.meta.slug);

                  if (!unlocked) {
                    return (
                      <li key={lesson.meta.slug}>
                        <div
                          aria-disabled="true"
                          className="block h-full cursor-not-allowed rounded-2xl border border-dashed border-stone-300 bg-stone-100/50 p-5 opacity-70 dark:border-stone-700 dark:bg-stone-900/40"
                        >
                          <h3 className="flex items-center gap-2 font-semibold text-stone-500 dark:text-stone-500">
                            <LockIcon className="h-4 w-4 shrink-0" />
                            {lesson.meta.title}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-stone-400 dark:text-stone-600">
                            {lesson.meta.summary}
                          </p>
                          {previousTier && (
                            <p className="mt-3 text-xs font-semibold text-stone-400 dark:text-stone-600">
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
                        className="group block h-full rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift active:translate-y-0 active:shadow-soft dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800"
                      >
                        <h3 className="flex items-center gap-2 font-semibold tracking-tight text-stone-950 dark:text-stone-50">
                          {completed && (
                            <span
                              aria-hidden="true"
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white dark:bg-accent-400 dark:text-stone-950"
                            >
                              <CheckIcon className="h-3 w-3" />
                            </span>
                          )}
                          <span className="group-hover:text-accent-800 dark:group-hover:text-accent-300">
                            {lesson.meta.title}
                          </span>
                          <ArrowRightIcon className="ml-auto h-4 w-4 shrink-0 text-stone-300 transition-transform group-hover:translate-x-1 group-hover:text-accent-600 dark:text-stone-600 dark:group-hover:text-accent-400" />
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                          {lesson.meta.summary}
                        </p>
                        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-stone-400 dark:text-stone-500">
                          <ClockIcon className="h-3.5 w-3.5" />
                          {lesson.meta.estimatedMinutes} min
                          {completed && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 font-semibold text-accent-800 dark:bg-accent-950/70 dark:text-accent-300">
                              Done
                            </span>
                          )}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
