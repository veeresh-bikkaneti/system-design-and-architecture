// Rate-limit bucket for /api/feedback. A v6 visitor usually controls a whole
// /64, so keying on the full address would let one machine rotate through
// 2^64 buckets. v4 stays whole; ::ffff:a.b.c.d is the v4 address wearing a
// v6 coat; no header (local dev) shares one bucket; anything we cannot parse
// gets its own bucket instead of being guessed into someone else's.
export function feedbackIpBucket(ip: string | null): string {
  if (!ip) return 'dev';
  if (isV4(ip)) return ip;
  const groups = parseV6(ip);
  if (!groups) return `raw:${ip}`;
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (mapped) {
    const hi = groups[6]!;
    const lo = groups[7]!;
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `v6:${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}`;
}

function isV4(s: string): boolean {
  const parts = s.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

// Returns 8 numeric groups, or null if `ip` is not a valid IPv6 address.
function parseV6(input: string): number[] | null {
  let s = input.split('%')[0]!; // drop a zone id
  if (!s.includes(':')) return null;
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!isV4(tail)) return null;
    const [a, b, c, d] = tail.split('.').map(Number) as [number, number, number, number];
    s = `${s.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const toGroups = (h: string): number[] | null => {
    if (h === '') return [];
    const out: number[] = [];
    for (const g of h.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = toGroups(halves[0]!);
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const rest = toGroups(halves[1]!);
  if (!rest || head.length + rest.length > 7) return null;
  return [...head, ...new Array<number>(8 - head.length - rest.length).fill(0), ...rest];
}
