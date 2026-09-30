/**
 * Focus-relocation helpers for BadgeToast dismissal.
 *
 * Kept in a component-free module so tests can import them without
 * tripping the fast-refresh mixed-exports lint.
 */

/**
 * True when the element is painted and therefore a real `.focus()` target.
 * `display:none` (e.g. Tailwind's `hidden` on the header Badges link below
 * the `sm` breakpoint) and `visibility:hidden` make `.focus()` a silent
 * no-op, so hidden candidates are skipped. Checked via computed style and
 * layout (`offsetParent` / bounding rect) rather than class names, so it
 * holds however the hiding is applied.
 */
function isRendered(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  // offsetParent is null for display:none (excluded above), detached nodes,
  // and position:fixed elements — the bounding rect separates the fixed
  // case from a genuinely unpainted element.
  if (el.offsetParent !== null) return true;
  const { width, height } = el.getBoundingClientRect();
  return width > 0 && height > 0;
}

/**
 * First *visible* Badges nav link, or null when every badges link is
 * hidden. A bare `querySelector('a[href="/badges"]')` returns the header
 * link first, which is `hidden sm:inline-flex` — `display:none` on phones
 * — so focusing it would silently drop focus to `<body>` on mobile. The
 * sidebar link is `hidden lg:block` too, so on small screens there may be
 * no visible badges link at all.
 */
export function findVisibleBadgesLink(doc: Document = document): HTMLElement | null {
  const links = Array.from(doc.querySelectorAll<HTMLElement>('a[href="/badges"]'));
  return links.find(isRendered) ?? null;
}

/**
 * Where focus goes when a toast that held focus is dismissed, in
 * preference order: the next remaining toast's first control, the first
 * remaining toast's first control, the first *visible* Badges nav link,
 * the main landmark (`#main-content` carries `tabIndex={-1}` so it is
 * programmatically focusable). Never null: the landmark is the last
 * resort, so focus is never dropped to `<body>`.
 */
export function resolveDismissFocusTarget(
  doc: Document,
  toastEls: Map<number, HTMLDivElement | null>,
  toasts: Array<{ key: number }>,
  afterKey: number,
): HTMLElement | null {
  const next = toasts.find((t) => t.key > afterKey) ?? toasts[0];
  const container = next ? toastEls.get(next.key) : undefined;
  return (
    (container?.querySelector('a, button') as HTMLElement | null) ??
    findVisibleBadgesLink(doc) ??
    (doc.querySelector('#main-content') as HTMLElement | null)
  );
}
