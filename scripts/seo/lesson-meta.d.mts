// Type declarations for lesson-meta.mjs (shared SEO build-time helpers).
export declare const repoRoot: string;
export declare const lessonsDir: string;
export declare function extractMeta(
  source: string,
  file: string,
): {
  slug: string;
  title: string;
  tier: 'beginner' | 'intermediate' | 'advanced';
  order: number;
  summary: string;
  estimatedMinutes: number;
  difficulty?: number;
  topics?: string[];
};
export declare function loadLessonMetas(): Array<{
  slug: string;
  title: string;
  tier: 'beginner' | 'intermediate' | 'advanced';
  order: number;
  summary: string;
  estimatedMinutes: number;
  difficulty?: number;
  topics?: string[];
}>;
export declare function siteConfig(): { base: string; origin: string; siteUrl: string };
