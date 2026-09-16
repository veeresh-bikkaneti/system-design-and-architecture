import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const QUIZ_PASS_THRESHOLD = 0.7;

export interface QuizResult {
  correct: number;
  total: number;
  passed: boolean;
}

export interface ProgressState {
  completedLessons: string[];
  quizResults: Record<string, QuizResult>;
  /** Badge ids the learner has already seen in the gallery (for the
   * newly-unlocked pop animation — it plays once per badge). */
  seenBadges: string[];
  /** Badge ids whose detail-page confetti already fired. */
  celebratedBadges: string[];
  markComplete: (slug: string) => void;
  markIncomplete: (slug: string) => void;
  recordQuizResult: (slug: string, correct: number, total: number) => void;
  isCompleted: (slug: string) => boolean;
  markBadgesSeen: (ids: string[]) => void;
  markBadgesCelebrated: (ids: string[]) => void;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      completedLessons: [],
      quizResults: {},
      seenBadges: [],
      celebratedBadges: [],

      markComplete: (slug) =>
        set((state) =>
          state.completedLessons.includes(slug)
            ? state
            : { completedLessons: [...state.completedLessons, slug] },
        ),

      markIncomplete: (slug) =>
        set((state) => ({
          completedLessons: state.completedLessons.filter((s) => s !== slug),
        })),

      recordQuizResult: (slug, correct, total) => {
        const passed = total > 0 && correct / total >= QUIZ_PASS_THRESHOLD;
        set((state) => ({
          quizResults: { ...state.quizResults, [slug]: { correct, total, passed } },
        }));
        if (passed) {
          get().markComplete(slug);
        }
      },

      isCompleted: (slug) => get().completedLessons.includes(slug),

      markBadgesSeen: (ids) =>
        set((state) => ({
          seenBadges: [...new Set([...state.seenBadges, ...ids])],
        })),

      markBadgesCelebrated: (ids) =>
        set((state) => ({
          celebratedBadges: [...new Set([...state.celebratedBadges, ...ids])],
        })),
    }),
    {
      name: 'sdm-progress',
    },
  ),
);
