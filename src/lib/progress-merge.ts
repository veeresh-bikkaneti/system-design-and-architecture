import type { QuizResult } from '../store/progress';

export interface ProgressSnapshot {
  completedLessons: string[];
  quizResults: Record<string, QuizResult>;
  seenBadges: string[];
  celebratedBadges: string[];
  updatedAt: string;
  rev: number;
}

function ratio(result: QuizResult | undefined): number {
  if (!result || result.total === 0) return 0;
  return result.correct / result.total;
}

function betterQuiz(a: QuizResult | undefined, b: QuizResult | undefined, aLater: boolean): QuizResult | undefined {
  if (!a) return b;
  if (!b) return a;
  const ra = ratio(a);
  const rb = ratio(b);
  if (ra > rb) return a;
  if (rb > ra) return b;
  return aLater ? a : b;
}

export function mergeProgress(local: ProgressSnapshot, remote: ProgressSnapshot): ProgressSnapshot {
  const left: ProgressSnapshot = {
    completedLessons: local.completedLessons ?? [],
    quizResults: local.quizResults ?? {},
    seenBadges: local.seenBadges ?? [],
    celebratedBadges: local.celebratedBadges ?? [],
    updatedAt: local.updatedAt ?? '',
    rev: local.rev ?? 0,
  };
  const right: ProgressSnapshot = {
    completedLessons: remote.completedLessons ?? [],
    quizResults: remote.quizResults ?? {},
    seenBadges: remote.seenBadges ?? [],
    celebratedBadges: remote.celebratedBadges ?? [],
    updatedAt: remote.updatedAt ?? '',
    rev: remote.rev ?? 0,
  };
  const aLater = left.updatedAt >= right.updatedAt;
  const slugs = new Set([...Object.keys(left.quizResults), ...Object.keys(right.quizResults)]);
  const quizResults: Record<string, QuizResult> = {};
  for (const slug of slugs) {
    const picked = betterQuiz(left.quizResults[slug], right.quizResults[slug], aLater);
    if (picked) quizResults[slug] = picked;
  }
  return {
    completedLessons: [...new Set([...left.completedLessons, ...right.completedLessons])],
    quizResults,
    seenBadges: [...new Set([...left.seenBadges, ...right.seenBadges])],
    celebratedBadges: [...new Set([...left.celebratedBadges, ...right.celebratedBadges])],
    updatedAt: new Date().toISOString(),
    rev: Math.max(left.rev, right.rev) + 1,
  };
}
