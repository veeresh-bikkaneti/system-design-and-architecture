/**
 * Share-URL builders for lesson pages. Pure functions (no DOM access) so
 * they're unit-testable; the `ShareButtons` component handles the Web Share
 * API / clipboard interaction.
 *
 * All URLs are fully encoded — titles contain characters like `&` and `#`
 * that would corrupt an intent URL unencoded.
 */

/** X (Twitter) "post this" intent URL. */
export function xIntentUrl(pageUrl: string, text: string): string {
  const params = new URLSearchParams({ url: pageUrl, text });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/** LinkedIn "share offsite" intent URL. */
export function linkedInIntentUrl(pageUrl: string): string {
  const params = new URLSearchParams({ url: pageUrl });
  return `https://www.linkedin.com/sharing/share-offsite/?${params.toString()}`;
}

/**
 * Copy text to the clipboard, with a legacy fallback for browsers without
 * the async Clipboard API. Resolves true on success, false otherwise —
 * callers show the "Copied!" state only on true.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Whether the device offers the native share sheet. */
export function canNativeShare(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  );
}
