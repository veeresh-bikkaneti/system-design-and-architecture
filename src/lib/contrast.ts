/**
 * WCAG 2.x contrast-ratio helpers, used to pin the label-text contrast
 * fixes (P1-8) with real numbers instead of eyeballed class names.
 *
 * Palette hexes are copied from the Tailwind v4 `stone` scale as defined
 * in `src/index.css` — keep them in sync if the theme tokens change.
 */

export const STONE = {
  white: '#ffffff',
  /** Page background, light mode. */
  stone50: '#fafaf9',
  stone400: '#a8a29e',
  stone500: '#78716c',
  stone600: '#57534e',
  /** Card background, dark mode. */
  stone900: '#1c1917',
  /** Page background, dark mode. */
  stone950: '#0c0a09',
} as const;

/** Relative luminance of an sRGB hex color, per WCAG 2.1 §1.4.3. */
export function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => {
    const s = parseInt(c.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio of two hex colors (1 … 21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** AA threshold for normal-size text. */
export const AA_NORMAL_TEXT = 4.5;

/** Round a ratio to two decimals for stable assertions and reports. */
export function roundedRatio(foreground: string, background: string): number {
  return Math.round(contrastRatio(foreground, background) * 100) / 100;
}
