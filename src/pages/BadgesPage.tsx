import { Link, useParams } from 'react-router-dom';
import { BadgeCard } from '../components/Badges/BadgeCard';
import { Confetti } from '../components/Badges/Confetti';
import '../components/Badges/badges.css';
import {
  badgeIconUrl,
  badgePublicUrl,
  getBadgeById,
  getBadgesWithStatus,
  isBadgeUnlocked,
  linkedInAddToProfileUrl,
  linkedInShareUrl,
  type BadgeKind,
  type BadgeWithStatus,
} from '../lib/badges';
import { useProgressStore } from '../store/progress';

const SECTION_ORDER: { kind: BadgeKind; title: string; blurb: string }[] = [
  { kind: 'course', title: 'Course', blurb: 'The ultimate achievement.' },
  { kind: 'tier', title: 'Tiers', blurb: 'Complete every lesson in a tier.' },
  { kind: 'lesson', title: 'Lessons', blurb: 'Finish individual lessons.' },
  { kind: 'quiz-ace', title: 'Quiz Aces', blurb: 'Score a perfect 100% on a lesson quiz.' },
];

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.4v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.55V9h3.57v11.45Z" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12.5 5 7.5 10l5 5" />
    </svg>
  );
}

export function BadgesPage() {
  const completedLessons = useProgressStore((state) => state.completedLessons);
  const quizResults = useProgressStore((state) => state.quizResults);
  const badges = getBadgesWithStatus({ completedLessons, quizResults });
  const unlockedCount = badges.filter((badge) => badge.unlocked).length;

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400">
        Progress
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900 dark:text-zinc-100">
        Your badges
      </h1>
      <p className="mt-2 max-w-xl text-stone-600 dark:text-zinc-400">
        Earn badges as you learn. When one is unlocked, you can add it to your LinkedIn
        profile or share it straight from its page.
      </p>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_1px_3px_rgb(120_53_15/0.05)] dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-stone-900 dark:text-zinc-100">
            {unlockedCount} of {badges.length} unlocked
          </p>
          <p className="text-xs text-stone-500 dark:text-zinc-400">
            {unlockedCount === badges.length && badges.length > 0
              ? 'Every badge earned \u2014 impressive.'
              : unlockedCount > 0
                ? 'Keep going \u2014 you\u2019re making progress.'
                : 'Finish a lesson or ace a quiz to earn your first.'}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuenow={unlockedCount}
          aria-valuemin={0}
          aria-valuemax={badges.length}
          aria-label="Badges unlocked"
          className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-zinc-700"
        >
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${badges.length > 0 ? (unlockedCount / badges.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {SECTION_ORDER.map((section) => {
        const sectionBadges = badges.filter((badge) => badge.kind === section.kind);
        if (sectionBadges.length === 0) return null;
        return (
          <section key={section.kind} className="mt-12">
            <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-zinc-100">
              {section.title}
            </h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-zinc-400">{section.blurb}</p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {sectionBadges.map((badge) => (
                <BadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LinkedInButtons({ badge }: { badge: BadgeWithStatus }) {
  const addUrl = linkedInAddToProfileUrl(badge);
  const shareUrl = linkedInShareUrl(badge);
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <a
        href={addUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl bg-[#0a66c2] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgb(10_102_194/0.35)] transition-all hover:-translate-y-px hover:bg-[#004182] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-2 active:translate-y-0"
      >
        <LinkedInIcon className="h-4 w-4" />
        Add to LinkedIn profile
      </a>
      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-px hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 active:translate-y-0 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-700 dark:hover:bg-amber-950/30 dark:hover:text-amber-200"
      >
        <LinkedInIcon className="h-4 w-4" />
        Share on LinkedIn
      </a>
    </div>
  );
}

export function BadgeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const completedLessons = useProgressStore((state) => state.completedLessons);
  const quizResults = useProgressStore((state) => state.quizResults);

  const definition = id ? getBadgeById(id) : undefined;

  if (!definition) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-zinc-100">
          Badge not found
        </h1>
        <p className="mt-2 text-stone-600 dark:text-zinc-400">
          There&apos;s no badge with that id.
        </p>
        <Link
          to="/badges"
          className="mt-6 inline-block rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgb(180_83_9/0.3)] transition-all hover:-translate-y-px hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 active:translate-y-0"
        >
          Back to badges
        </Link>
      </div>
    );
  }

  const unlocked = isBadgeUnlocked(definition, { completedLessons, quizResults });
  const badge: BadgeWithStatus = { ...definition, unlocked };
  const publicUrl = badgePublicUrl(badge.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/badges"
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-amber-700 transition-colors hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:text-amber-400 dark:hover:text-amber-300"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All badges
      </Link>

      <div className="mt-8 flex flex-col items-center text-center">
        <div className={`badge-hero ${unlocked ? '' : 'badge-hero--locked'}`}>
          {unlocked && <Confetti />}
          <img src={badgeIconUrl(badge.iconFile)} alt={`${badge.name} badge artwork`} />
          {!unlocked && (
            <span className="badge-hero__lock" aria-hidden="true">
              <LockIcon />
            </span>
          )}
        </div>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-stone-900 dark:text-zinc-100">
          {badge.name}
        </h1>
        <p className="mt-2 max-w-md leading-relaxed text-stone-600 dark:text-zinc-400">
          {badge.description}
        </p>

        <div className="mt-5">
          {unlocked ? (
            <span className="badge-card__pill badge-card__pill--unlocked">
              <CheckIcon />
              Unlocked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-stone-100 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.08em] text-stone-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <LockIcon className="h-3.5 w-3.5" />
              Locked
            </span>
          )}
        </div>

        {!unlocked && (
          <div className="mt-6 w-full max-w-md rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-5 py-4 text-left dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-amber-800 dark:text-amber-300">
              How to unlock
            </p>
            <p className="mt-1 text-sm text-stone-700 dark:text-zinc-300">{badge.criteria}</p>
          </div>
        )}

        {unlocked && (
          <div className="mt-8">
            <LinkedInButtons badge={badge} />
            <p className="mt-4 text-xs text-stone-500 dark:text-zinc-400">
              Public badge URL:{' '}
              <a
                href={publicUrl}
                className="break-all font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:text-amber-400 dark:hover:text-amber-300"
              >
                {publicUrl}
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
