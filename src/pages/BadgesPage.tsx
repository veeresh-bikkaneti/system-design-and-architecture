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

export function BadgesPage() {
  const completedLessons = useProgressStore((state) => state.completedLessons);
  const quizResults = useProgressStore((state) => state.quizResults);
  const badges = getBadgesWithStatus({ completedLessons, quizResults });
  const unlockedCount = badges.filter((badge) => badge.unlocked).length;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Badges</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Earn badges as you learn. Share them on LinkedIn straight from each badge&apos;s page.
      </p>

      <div className="mt-4">
        <div
          role="progressbar"
          aria-valuenow={unlockedCount}
          aria-valuemin={0}
          aria-valuemax={badges.length}
          aria-label="Badges unlocked"
          className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        >
          <div
            className="h-full rounded-full bg-violet-600 transition-all"
            style={{ width: `${badges.length > 0 ? (unlockedCount / badges.length) * 100 : 0}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {unlockedCount} / {badges.length} badges unlocked
        </p>
      </div>

      {SECTION_ORDER.map((section) => {
        const sectionBadges = badges.filter((badge) => badge.kind === section.kind);
        if (sectionBadges.length === 0) return null;
        return (
          <section key={section.kind} className="mt-10">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {section.title}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{section.blurb}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
    <div className="flex flex-wrap gap-3">
      <a
        href={addUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#004182]"
      >
        Add to LinkedIn profile
      </a>
      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Badge not found
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          There&apos;s no badge with that id.
        </p>
        <Link
          to="/badges"
          className="mt-6 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
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
        className="text-sm font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
      >
        ← All badges
      </Link>

      <div className="mt-6 flex flex-col items-center text-center">
        <div className={`badge-hero ${unlocked ? '' : 'badge-hero--locked'}`}>
          {unlocked && <Confetti />}
          <img src={badgeIconUrl(badge.iconFile)} alt={`${badge.name} badge artwork`} />
          {!unlocked && (
            <span className="absolute inset-0 flex items-center justify-center text-5xl" aria-hidden="true">
              🔒
            </span>
          )}
        </div>

        <h1 className="mt-6 text-3xl font-bold text-slate-900 dark:text-slate-100">
          {badge.name}
        </h1>
        <p className="mt-2 max-w-md text-slate-600 dark:text-slate-400">{badge.description}</p>

        <div className="mt-4">
          {unlocked ? (
            <span className="badge-card__pill badge-card__pill--unlocked">Unlocked</span>
          ) : (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Locked
            </span>
          )}
        </div>

        {!unlocked && (
          <p className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            How to unlock: {badge.criteria}
          </p>
        )}

        {unlocked && (
          <div className="mt-6">
            <LinkedInButtons badge={badge} />
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Public badge URL:{' '}
              <a
                href={publicUrl}
                className="break-all text-violet-700 underline hover:text-violet-900 dark:text-violet-300"
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
