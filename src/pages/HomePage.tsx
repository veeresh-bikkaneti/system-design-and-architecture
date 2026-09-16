import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { lessons, tierLabels, tierOrder, type Tier } from '../lib/lessons';
import { getBadgesWithStatus } from '../lib/badges';
import { isLessonUnlocked, isTierUnlocked } from '../lib/progress-gate';
import { useProgressStore } from '../store/progress';
import { Icon } from '../components/ui/Icon';
import { ProgressBar } from '../components/ui/ProgressBar';
import { buttonClasses } from '../components/ui/Button';
import { PacketFlow } from '../components/diagrams/PacketFlow';

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft dark:border-stone-800 dark:bg-stone-900">
      <p className="font-display text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
        {value}
      </p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{label}</p>
    </div>
  );
}

/**
 * Per-lesson progress ring: full + check when done, empty otherwise.
 * Motion-animated on scroll into view; instant under reduced motion.
 */
function ProgressRing({ done, upNext }: { done: boolean; upNext: boolean }) {
  const reduceMotion = useReducedMotion();
  const r = 9;
  const circumference = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex h-6 w-6 shrink-0"
      role="img"
      aria-label={done ? 'Completed' : upNext ? 'Up next' : 'Not started'}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth={3}
          className="stroke-stone-200 dark:stroke-stone-700"
        />
        <motion.circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          className="stroke-accent-500 dark:stroke-accent-400"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: done ? 0 : circumference }}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.9, ease: 'easeOut' }
          }
        />
      </svg>
      {done && (
        <Icon name="check" className="absolute inset-0 m-auto h-3 w-3 text-accent-700 dark:text-accent-300" />
      )}
    </span>
  );
}

const tierDifficultyFallback: Record<Tier, number> = {
  beginner: 1,
  intermediate: 3,
  advanced: 4,
};

/** Five dots showing how steep a lesson is, 1 (gentle) to 5 (steep). */
function DifficultyDots({ level }: { level: number }) {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={`Difficulty ${clamped} of 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            i < clamped
              ? 'bg-accent-500 dark:bg-accent-400'
              : 'bg-stone-200 dark:bg-stone-700'
          }`}
        />
      ))}
    </span>
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
        <ProgressBar
          value={completedCount}
          max={totalLessons}
          label={`${tierLabels[tier]} progress`}
        />
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
  // Per-lesson engagement: a quiz attempt means the learner actually worked
  // through the lesson — that's "in progress". Without one, the lesson was
  // never meaningfully opened, even when other lessons are done. This keeps
  // "Resume" / "Pick up where you left off" honest instead of global.
  const continueInProgress =
    continueLesson != null && quizResults[continueLesson.meta.slug] !== undefined;

  const badgeStatuses = getBadgesWithStatus({ completedLessons, quizResults });
  const unlockedBadgeCount = badgeStatuses.filter((badge) => badge.unlocked).length;
  const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.meta.estimatedMinutes, 0);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero — the course's animated diagrams, live above the fold */}
      <section className="pt-4 sm:pt-8">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-700 dark:text-accent-400">
              A self-paced course
            </p>
            <h1 className="mt-3 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-stone-950 text-balance sm:text-6xl dark:text-stone-50">
              System design, from first principles to interview-ready.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600 dark:text-stone-400">
              Learn how the systems you use every day actually work — caching, load
              balancing, databases, queues — through plain-language lessons,
              diagrams that move, and an AI tutor that sketches the architecture
              with you as you go.
            </p>

            {continueLesson && (
              <div className="mt-8">
                <Link
                  to={`/lesson/${continueLesson.meta.slug}`}
                  className={buttonClasses('primary', 'lg')}
                >
                  {hasStarted ? 'Continue lesson' : 'Start learning'}
                  <Icon name="arrowRight" className="h-5 w-5" />
                </Link>
                <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
                  {continueInProgress
                    ? 'Pick up where you left off: '
                    : hasStarted
                      ? 'Up next: '
                      : 'First up: '}
                  <span className="font-semibold text-stone-700 dark:text-stone-200">
                    {continueLesson.meta.title}
                  </span>{' '}
                  · {continueLesson.meta.estimatedMinutes} min
                </p>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <PacketFlow
              stages={['You', 'Load balancer']}
              servers={['api-1', 'api-2', 'api-3']}
              requestLabel="GET"
              duration={4}
            />
            <p className="mt-3 text-center text-sm text-stone-500 dark:text-stone-400">
              A request&apos;s journey, live — every lesson animates like this.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
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
          <Link to="/roadmap" className={buttonClasses('secondary')}>
            See the animated journey
            <Icon name="arrowRight" className="h-4 w-4" />
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
      <section id="all-lessons" className="mt-14 scroll-mt-24" aria-label="All lessons">
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
                <span className="text-xs font-medium tabular-nums text-stone-400 dark:text-stone-400">
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
                          <h3 className="flex items-center gap-2 font-semibold text-stone-500 dark:text-stone-400">
                            <Icon name="lock" className="h-4 w-4 shrink-0" />
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

                  const isContinue =
                    continueLesson?.meta.slug === lesson.meta.slug && !completed;
                  const difficulty =
                    lesson.meta.difficulty ?? tierDifficultyFallback[lesson.meta.tier];
                  const topics = lesson.meta.topics ?? [];

                  return (
                    <li key={lesson.meta.slug}>
                      <Link
                        to={`/lesson/${lesson.meta.slug}`}
                        className="group block h-full rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-lift active:translate-y-0 active:shadow-soft dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800"
                      >
                        <div className="flex items-start gap-3">
                          <ProgressRing done={completed} upNext={isContinue} />
                          <h3 className="min-w-0 flex-1 font-semibold tracking-tight text-stone-950 dark:text-stone-50">
                            <span className="group-hover:text-accent-800 dark:group-hover:text-accent-300">
                              {lesson.meta.title}
                            </span>
                          </h3>
                          <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-stone-300 transition-[transform,color] group-hover:translate-x-1 group-hover:text-accent-600 dark:text-stone-600 dark:group-hover:text-accent-400" />
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                          {lesson.meta.summary}
                        </p>
                        {topics.length > 0 && (
                          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Topics">
                            {topics.slice(0, 3).map((topic) => (
                              <li
                                key={topic}
                                className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                              >
                                {topic}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-medium text-stone-400 dark:text-stone-400">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon name="clock" className="h-3.5 w-3.5" />
                            {lesson.meta.estimatedMinutes} min
                          </span>
                          <DifficultyDots level={difficulty} />
                          {completed && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 font-semibold text-accent-800 dark:bg-accent-950/70 dark:text-accent-300">
                              Done
                            </span>
                          )}
                          {isContinue && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-600 px-2 py-0.5 font-semibold text-white dark:bg-accent-400 dark:text-stone-950">
                              {continueInProgress ? 'Resume →' : 'Start →'}
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

      {/* Footer — the page used to end abruptly after the last lesson card */}
      <footer className="border-t border-stone-200/70 py-10 text-center dark:border-stone-800">
        <p className="font-display text-sm font-semibold tracking-tight text-stone-700 dark:text-stone-300">
          System Design Mastery
        </p>
        <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
          Built for learners, one lesson at a time.
        </p>
      </footer>
    </div>
  );
}
