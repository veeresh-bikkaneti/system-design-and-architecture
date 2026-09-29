/**
 * Shared SEO URL helpers (client-side).
 *
 * The origin is the production GitHub Pages host; `import.meta.env.BASE_URL`
 * carries the repo base path (`/system-design-and-architecture/` in
 * production, `/` in dev). Social crawlers need absolute URLs, so every
 * helper here returns one.
 */

const ORIGIN = 'https://veeresh-bikkaneti.github.io';

/** Absolute site root, e.g. `https://veeresh-bikkaneti.github.io/system-design-and-architecture/`. */
export function siteUrl(): string {
  return new URL(import.meta.env.BASE_URL, ORIGIN).toString();
}

/**
 * Absolute URL of a generated Open Graph image, e.g.
 * `ogImageUrl('lesson-cap-theorem')`. The PNGs are generated at build time
 * by `scripts/seo/generate-og-images.mjs` into `public/og/`.
 */
export function ogImageUrl(name: string): string {
  return new URL(`og/${name}.png`, siteUrl()).toString();
}
