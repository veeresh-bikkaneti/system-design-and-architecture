import { lessons } from './lessons';

export function getPreviewSlug(): string {
  const sorted = [...lessons].sort((a, b) => a.meta.order - b.meta.order);
  if (sorted.length === 0) throw new Error('No lessons');
  return sorted[0].meta.slug;
}

export function isPreviewSlug(slug: string): boolean {
  return slug === getPreviewSlug();
}
