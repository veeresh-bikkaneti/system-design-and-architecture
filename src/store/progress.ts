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
  markComplete: (slug: string) => void;
  markIncomplete: (slug: string) => void;
  recordQuizResult: (slug: string, correct: number, total: number) => void;
  isCompleted: (slug: string) => boolean;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      completedLessons: [],
      quizResults: {},

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
    }),
    {
      name: 'sdm-progress',
    },
  ),
);
