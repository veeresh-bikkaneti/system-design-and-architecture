import { useEffect } from 'react';
import { ogImageUrl, siteUrl } from '../lib/seo';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function removeMeta(attr: 'name' | 'property', key: string) {
  document.head
    .querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    ?.remove();
}

// Generated OG images are always 1200×630 — keep in sync with
// scripts/seo/generate-og-images.mjs.
const OG_IMAGE_WIDTH = '1200';
const OG_IMAGE_HEIGHT = '630';

export interface SeoProps {
  title: string;
  description: string;
  /** Route path without the base, e.g. `/lesson/caching-strategies`. */
  path: string;
  /**
   * Generated Open Graph image name (without `og/` prefix or `.png`), e.g.
   * `'lesson-caching-strategies'`. Use {@link ogImageUrl} to build it.
   * Omitting it removes any image tags, so navigating from a lesson to a
   * route without an image never leaves a stale preview behind.
   */
  image?: string;
}

/**
 * Keeps the document head in sync during client-side navigation (tab title,
 * description, canonical, social preview tags). The prerendered static HTML
 * already carries identical tags for crawlers — this is for humans moving
 * around the SPA, where the head would otherwise stay stuck on the entry
 * page's tags.
 */
export function Seo({ title, description, path, image }: SeoProps) {
  useEffect(() => {
    const canonical = new URL(path.replace(/^\//, ''), siteUrl()).toString();
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('property', 'og:type', path === '/' ? 'website' : 'article');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonical);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    if (image) {
      const imageUrl = ogImageUrl(image);
      setMeta('property', 'og:image', imageUrl);
      setMeta('property', 'og:image:width', OG_IMAGE_WIDTH);
      setMeta('property', 'og:image:height', OG_IMAGE_HEIGHT);
      setMeta('property', 'og:image:alt', title);
      setMeta('name', 'twitter:image', imageUrl);
    } else {
      removeMeta('property', 'og:image');
      removeMeta('property', 'og:image:width');
      removeMeta('property', 'og:image:height');
      removeMeta('property', 'og:image:alt');
      removeMeta('name', 'twitter:image');
    }
    setCanonical(canonical);
  }, [title, description, path, image]);
  return null;
}

/**
 * Injects JSON-LD structured data into the head; removed on unmount so
 * client-side navigation never stacks stale schemas.
 */
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data);
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = json;
    el.dataset.seoJsonLd = 'true';
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [json]);
  return null;
}
