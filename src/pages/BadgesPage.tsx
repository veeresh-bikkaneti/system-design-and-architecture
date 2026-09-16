import { useEffect, useMemo } from 'react';
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
import { buttonClasses } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { ProgressBar } from '../components/ui/ProgressBar';

const SECTION_ORDER: { kind: BadgeKind; title: string; blurb: string }[] = [
  { kind: 'course', title: 'Course', blurb: 'The ultimate achievement.' },
  { kind: 'tier', title: 'Tiers', blurb: 'Complete every lesson in a tier.' },
  { kind: 'lesson', title: 'Lessons', blurb: 'Finish individual lessons.' },
  { kind: 'quiz-ace', title: 'Quiz Aces', blurb: 'Score a perfect 100% on a lesson quiz.' },
];

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.4v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.55V9h3.57v11.45Z" />
    </svg>
  );
}

export function BadgesPage() {
  const completedLessons = useProgressStore((state) => state.completedLessons);
  const quizResults = useProgressStore((state) => state.quizResults);
  const seenBadges = useProgressStore((state) => state.seenBadges);
  const markBadgesSeen = useProgressStore((state) => state.markBadgesSeen);
  const badges = getBadgesWithStatus({ completedLessons, quizResults });
  const unlockedCount = badges.filter((badge) => badge.unlocked).length;

  // Mark every unlocked badge as seen shortly after the gallery mounts, so
  // the pop-in animation plays once per badge — after the 0.55s animation
  // has had a chance to run.
  useEffect(() => {
    const unlockedIds = badges.filter((badge) => badge.unlocked).map((badge) => badge.id);
    const timer = window.setTimeout(() => markBadgesSeen(unlockedIds), 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markBadgesSeen]);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400">
        Progress
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
        Your badges
      </h1>
      <p className="mt-2 max-w-xl text-stone-600 dark:text-stone-400">
        Earn badges as you learn. When one is unlocked, you can add it to your LinkedIn
        profile or share it straight from its page.
      </p>

      <Card className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            {unlockedCount} of {badges.length} unlocked
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {unlockedCount === badges.length && badges.length > 0
              ? 'Every badge earned \u2014 impressive.'
              : unlockedCount > 0
                ? 'Keep going \u2014 you\u2019re making progress.'
                : 'Finish a lesson or ace a quiz to earn your first.'}
          </p>
        </div>
        <ProgressBar
          value={unlockedCount}
          max={badges.length}
          label="Badges unlocked"
          size="md"
          className="mt-3"
        />
      </Card>

      {SECTION_ORDER.map((section) => {
        const sectionBadges = badges.filter((badge) => badge.kind === section.kind);
        if (sectionBadges.length === 0) return null;
        return (
          <section key={section.kind} className="mt-12">
            <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              {section.title}
            </h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{section.blurb}</p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {sectionBadges.map((badge) => (
                <BadgeCard
                  key={badge.id}
                  badge={badge}
                  isNew={badge.unlocked && !seenBadges.includes(badge.id)}
                />
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
        className="inline-flex items-center gap-2 rounded-xl bg-[#0a66c2] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgb(10_102_194/0.35)] transition-[transform,background-color,box-shadow] hover:-translate-y-px hover:bg-[#004182] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-2 active:translate-y-0"
      >
        <LinkedInIcon className="h-4 w-4" />
        Add to LinkedIn profile
      </a>
      <a href={shareUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses('secondary')}>
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
  const celebratedBadges = useProgressStore((state) => state.celebratedBadges);
  const markBadgesCelebrated = useProgressStore((state) => state.markBadgesCelebrated);

  // getBadgeById() builds fresh objects on every call — memoize on `id` so the
  // celebration effect below sees a stable reference and can't loop forever
  // (new identity every render -> effect re-fires -> set() -> re-render ...).
  const definition = useMemo(() => (id ? getBadgeById(id) : undefined), [id]);
  const unlocked = definition
    ? isBadgeUnlocked(definition, { completedLessons, quizResults })
    : false;
  // Confetti fires once per badge — the first time its detail page is
  // opened after unlocking — not on every visit.
  const celebrate = !!definition && unlocked && !celebratedBadges.includes(definition.id);

  useEffect(() => {
    if (definition && unlocked && !celebratedBadges.includes(definition.id)) {
      markBadgesCelebrated([definition.id]);
    }
  }, [definition, unlocked, celebratedBadges, markBadgesCelebrated]);

  if (!definition) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
          Badge not found
        </h1>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          There&apos;s no badge with that id.
        </p>
        <Link to="/badges" className={buttonClasses('primary', 'md', 'mt-6')}>
          Back to badges
        </Link>
      </div>
    );
  }

  const badge: BadgeWithStatus = { ...definition, unlocked };
  const publicUrl = badgePublicUrl(badge.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/badges"
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-amber-700 transition-colors hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:text-amber-400 dark:hover:text-amber-300"
      >
        <Icon name="arrowLeft" />
        All badges
      </Link>

      <div className="mt-8 flex flex-col items-center text-center">
        <div className={`badge-hero ${unlocked ? '' : 'badge-hero--locked'}`}>
          {celebrate && <Confetti />}
          <img src={badgeIconUrl(badge.iconFile)} alt={`${badge.name} badge artwork`} />
          {!unlocked && (
            <span className="badge-hero__lock" aria-hidden="true">
              <Icon name="lockFilled" className="h-12 w-12" />
            </span>
          )}
        </div>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
          {badge.name}
        </h1>
        <p className="mt-2 max-w-md leading-relaxed text-stone-600 dark:text-stone-400">
          {badge.description}
        </p>

        <div className="mt-5">
          {unlocked ? (
            <span className="badge-card__pill badge-card__pill--unlocked">
              <Icon name="checkFilled" />
              Unlocked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-stone-100 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.08em] text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
              <Icon name="lockFilled" className="h-3.5 w-3.5" />
              Locked
            </span>
          )}
        </div>

        {!unlocked && (
          <div className="mt-6 w-full max-w-md rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-5 py-4 text-left dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-amber-800 dark:text-amber-300">
              How to unlock
            </p>
            <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">{badge.criteria}</p>
          </div>
        )}

        {unlocked && (
          <div className="mt-8">
            <LinkedInButtons badge={badge} />
            <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
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
