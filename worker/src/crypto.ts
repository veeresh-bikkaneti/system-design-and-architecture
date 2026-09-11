// Shared low-level crypto helpers. Used by index.ts (hashing IPs for
// data-minimization) and auth.ts (hashing magic-link/session tokens, where
// the hash is a real security boundary -- see auth.ts for why raw tokens
// are never stored).

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// A cryptographically random, URL-safe token. 32 bytes (256 bits) of entropy
// -- comfortably unguessable for a bearer token with a short expiry.
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
