import type { ProgressState, QuizResult } from '../store/progress';
import { lessons, tierLabels, tierOrder, type Tier } from './lessons';

export type BadgeKind = 'course' | 'tier' | 'lesson' | 'quiz-ace';

export interface BadgeDefinition {
  /** Stable, URL-safe id (also used as the LinkedIn credentialId). */
  id: string;
  kind: BadgeKind;
  name: string;
  description: string;
  /** Short human-readable unlock requirement, shown on locked badges. */
  criteria: string;
  /** File name of the SVG artwork in public/badges/. */
  iconFile: string;
}

/** The slice of progress state that badge rules are computed from. */
export type ProgressSnapshot = Pick<ProgressState, 'completedLessons' | 'quizResults'>;

export const ORGANIZATION_NAME = 'System Design Mastery';

/** Public URL of a badge artwork file, honoring the GitHub Pages subpath base. */
export function badgeIconUrl(iconFile: string): string {
  return `${import.meta.env.BASE_URL}badges/${iconFile}`;
}

/**
 * Full public URL of a badge's shareable detail page.
 * HashRouter makes this work as a static page on GitHub Pages:
 *   https://<user>.github.io/<repo>/#/badges/<id>
 */
export function badgePublicUrl(badgeId: string): string {
  const base = import.meta.env.BASE_URL;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${base}#/badges/${badgeId}`;
}

/** "Add to LinkedIn profile" deep link (Certification). */
export function linkedInAddToProfileUrl(badge: BadgeDefinition): string {
  const params = new URLSearchParams({
    name: badge.name,
    organizationName: ORGANIZATION_NAME,
    credentialId: badge.id,
    credentialUrl: badgePublicUrl(badge.id),
  });
  return `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&${params.toString()}`;
}

/** "Share on LinkedIn" link for a badge's public page. */
export function linkedInShareUrl(badge: BadgeDefinition): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    badgePublicUrl(badge.id),
  )}`;
}

function lessonBadge(slug: string, title: string): BadgeDefinition {
  return {
    id: `lesson-${slug}`,
    kind: 'lesson',
    name: `Lesson Complete: ${title}`,
    description: `Finished the "${title}" lesson in ${ORGANIZATION_NAME}.`,
    criteria: `Complete the "${title}" lesson.`,
    iconFile: 'lesson.svg',
  };
}

function quizAceBadge(slug: string, title: string): BadgeDefinition {
  return {
    id: `quiz-ace-${slug}`,
    kind: 'quiz-ace',
    name: `Quiz Ace: ${title}`,
    description: `Answered every question correctly on the "${title}" quiz — a perfect score.`,
    criteria: `Score 100% on the "${title}" quiz.`,
    iconFile: 'quiz-ace.svg',
  };
}

function tierBadge(tier: Tier): BadgeDefinition {
  return {
    id: `tier-${tier}`,
    kind: 'tier',
    name: `${tierLabels[tier]} Tier Complete`,
    description: `Completed every lesson in the ${tierLabels[tier]} tier.`,
    criteria: `Complete all ${tierLabels[tier]} tier lessons.`,
    iconFile: 'tier.svg',
  };
}

const courseBadge: BadgeDefinition = {
  id: 'course-complete',
  kind: 'course',
  name: 'System Design Master',
  description: `Completed every lesson in ${ORGANIZATION_NAME}. The full journey, done.`,
  criteria: 'Complete every lesson in the course.',
  iconFile: 'course.svg',
};

/** All badge definitions, derived from the lesson catalog (dynamic per lesson). */
export function getAllBadges(): BadgeDefinition[] {
  const badges: BadgeDefinition[] = [courseBadge];
  for (const tier of tierOrder) {
    if (lessons.some((lesson) => lesson.meta.tier === tier)) {
      badges.push(tierBadge(tier));
    }
  }
  for (const lesson of lessons) {
    badges.push(lessonBadge(lesson.meta.slug, lesson.meta.title));
    badges.push(quizAceBadge(lesson.meta.slug, lesson.meta.title));
  }
  return badges;
}

export function getBadgeById(id: string): BadgeDefinition | undefined {
  return getAllBadges().find((badge) => badge.id === id);
}

function isPerfectScore(result: QuizResult | undefined): boolean {
  return !!result && result.total > 0 && result.correct === result.total && result.passed;
}

/**
 * Badge unlock rules. Everything is computed from the existing progress
 * store — no extra state needed.
 *
 * Note: the store keeps only the *latest* quiz result per lesson, so there is
 * no first-attempt history to check. "Quiz ace" therefore means a perfect
 * score (100%) rather than "passed on the first try".
 */
export function isBadgeUnlocked(badge: BadgeDefinition, progress: ProgressSnapshot): boolean {
  const { completedLessons, quizResults } = progress;
  switch (badge.kind) {
    case 'course':
      return lessons.length > 0 && lessons.every((l) => completedLessons.includes(l.meta.slug));
    case 'tier': {
      const tier = badge.id.replace(/^tier-/, '') as Tier;
      const tierLessons = lessons.filter((l) => l.meta.tier === tier);
      return tierLessons.length > 0 && tierLessons.every((l) => completedLessons.includes(l.meta.slug));
    }
    case 'lesson': {
      const slug = badge.id.replace(/^lesson-/, '');
      return completedLessons.includes(slug);
    }
    case 'quiz-ace': {
      const slug = badge.id.replace(/^quiz-ace-/, '');
      return isPerfectScore(quizResults[slug]);
    }
  }
}

export interface BadgeWithStatus extends BadgeDefinition {
  unlocked: boolean;
}

/** All badges with their current unlock state for the given progress. */
export function getBadgesWithStatus(progress: ProgressSnapshot): BadgeWithStatus[] {
  return getAllBadges().map((badge) => ({ ...badge, unlocked: isBadgeUnlocked(badge, progress) }));
}
