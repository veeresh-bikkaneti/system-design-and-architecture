// Types for the build-time lesson chunker, used by tests.
export interface LessonSection {
  id: string;
  slug: string;
  title: string;
  heading: string;
  text: string;
}

export function proseLines(source: string): string[];
export function chunkLesson(source: string, file?: string): LessonSection[];
export function chunkAllLessons(): LessonSection[];
