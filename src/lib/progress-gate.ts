import { lessons, tierOrder, type Tier } from './lessons';

/**
 * Beginner is always unlocked. A later tier unlocks once every lesson in the
 * immediately preceding tier (per tierOrder) has been completed.
 */
export function isTierUnlocked(tier: Tier, completedLessons: string[]): boolean {
  const tierIndex = tierOrder.indexOf(tier);
  if (tierIndex <= 0) return true;

  const previousTier = tierOrder[tierIndex - 1];
  const previousTierLessons = lessons.filter((lesson) => lesson.meta.tier === previousTier);

  if (previousTierLessons.length === 0) {
    // Nothing to complete in the previous tier — don't block on an empty tier.
    return isTierUnlocked(previousTier, completedLessons);
  }

  return previousTierLessons.every((lesson) => completedLessons.includes(lesson.meta.slug));
}

export function isLessonUnlocked(lessonSlug: string, completedLessons: string[]): boolean {
  const lesson = lessons.find((l) => l.meta.slug === lessonSlug);
  if (!lesson) return false;
  return isTierUnlocked(lesson.meta.tier, completedLessons);
}
