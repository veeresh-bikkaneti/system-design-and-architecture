import { useEffect } from 'react';

const ORIGIN = 'https://veeresh-bikkaneti.github.io';

function siteUrl(): string {
  return new URL(import.meta.env.BASE_URL, ORIGIN).toString();
}

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

export interface SeoProps {
  title: string;
  description: string;
  /** Route path without the base, e.g. `/lesson/caching-strategies`. */
  path: string;
}

/**
 * Keeps the document head in sync during client-side navigation (tab title,
 * description, canonical, social preview tags). The prerendered static HTML
 * already carries identical tags for crawlers — this is for humans moving
 * around the SPA, where the head would otherwise stay stuck on the entry
 * page's tags.
 */
export function Seo({ title, description, path }: SeoProps) {
  useEffect(() => {
    const canonical = new URL(path.replace(/^\//, ''), siteUrl()).toString();
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonical);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setCanonical(canonical);
  }, [title, description, path]);
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
