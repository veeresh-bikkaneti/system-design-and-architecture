import { EXAM_PASS_THRESHOLD, publicQuestions, scoreSubmission } from './exam';

export interface Env {
  DB: D1Database;
}

interface CredentialRow {
  id: string;
  email: string;
  course_slug: string;
  score: number;
  total_questions: number;
  issued_at: string;
  badge_status: string;
  badge_url: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

// A public verify page must not expose a learner's full email to any visitor
// who has the link. Show at most 2 characters of the local part, and never
// more than half of it -- a 1-2 character local part (common: initials,
// short handles) must come out fully masked, not fully exposed.
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visibleCount = Math.min(2, Math.floor(local.length / 2));
  const visible = local.slice(0, visibleCount);
  return `${visible}${'*'.repeat(Math.max(local.length - visibleCount, 3))}@${domain}`;
}

// Only ever render a badge URL that is a well-formed https: link. escapeHtml
// alone stops attribute-breakout/script-tag injection but does NOT stop a
// javascript:/data: value from becoming a live, clickable link -- those
// contain none of the characters escapeHtml touches. Reject anything else.
function safeHttpsUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function page(title: string, body: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f8fafc; color: #0f172a; margin: 0; padding: 2rem 1rem;
    display: flex; justify-content: center;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #f1f5f9; }
    .card { background: #1e293b !important; border-color: #334155 !important; }
    .muted { color: #94a3b8 !important; }
  }
  .card {
    max-width: 32rem; width: 100%; background: #fff; border: 1px solid #e2e8f0;
    border-radius: 0.75rem; padding: 2rem; margin-top: 2rem;
  }
  h1 { font-size: 1.25rem; margin: 0 0 1rem; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; margin: 1rem 0; }
  dt { font-weight: 600; }
  dd { margin: 0; }
  .muted { color: #64748b; font-size: 0.875rem; }
  .badge-ok { color: #16a34a; font-weight: 600; }
  .badge-no { color: #dc2626; font-weight: 600; }
</style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function notFoundPage(id: string): Response {
  return page(
    'Credential not found',
    `<h1><span class="badge-no">✕</span> No credential found</h1>
     <p class="muted">No credential exists with id <code>${escapeHtml(id)}</code>. Check the link and try again.</p>`,
    404,
  );
}

function credentialPage(cred: CredentialRow): Response {
  const issuedDate = new Date(cred.issued_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const safeBadgeUrl = cred.badge_url ? safeHttpsUrl(cred.badge_url) : null;
  const badgeLine =
    cred.badge_status === 'issued' && safeBadgeUrl
      ? `<dt>Badge</dt><dd><a href="${escapeHtml(safeBadgeUrl)}">View Open Badge</a></dd>`
      : '';
  return page(
    'Credential verified',
    `<h1><span class="badge-ok">✓</span> Verified credential</h1>
     <dl>
       <dt>Course</dt><dd>${escapeHtml(cred.course_slug)}</dd>
       <dt>Holder</dt><dd>${escapeHtml(maskEmail(cred.email))}</dd>
       <dt>Score</dt><dd>${cred.score} / ${cred.total_questions}</dd>
       <dt>Issued</dt><dd>${escapeHtml(issuedDate)}</dd>
       ${badgeLine}
     </dl>
     <p class="muted">Credential id: ${escapeHtml(cred.id)}</p>`,
    200,
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS_PER_EMAIL_PER_DAY = 5;
const MAX_ATTEMPTS_PER_IP_PER_DAY = 10;

// Explicit allowlist rather than '*'. Important to be honest about what this
// does and doesn't provide: CORS is enforced by the BROWSER, and it only
// controls whether a page's JS is allowed to read the response -- it does
// NOT stop the request from reaching and being processed by this Worker.
// A page on any origin can still trigger handleExamSubmit's rate-limit
// check and DB write (e.g. via a Content-Type that keeps the browser from
// preflighting at all); this allowlist just keeps such a page from reading
// the JSON result back. Real protection against a *fraudulent credential*
// -- as opposed to a wasted rate-limit slot or a junk audit row -- comes
// from Phase 3/4 requiring a *verified* email before anything is issued,
// not from anything here.
const ALLOWED_ORIGINS = new Set([
  'https://veeresh-bikkaneti.github.io',
  'http://localhost:5173', // vite dev
  'http://localhost:4173', // vite preview
]);

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Not a secret -- this exists only so raw IPs aren't stored at rest (data
// minimization for the exam_attempts audit trail), not as a cryptographic
// guarantee. Phase 2 deliberately needs zero new secrets/accounts, matching
// its own scope -- identity (Phase 3) is where real secrets first show up.
const IP_HASH_PEPPER = 'sdm-exam-v1';

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${IP_HASH_PEPPER}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// `column` is a TypeScript literal union, always a hardcoded call-site value,
// never derived from a request -- interpolating it is safe (there is no path
// from client input to this parameter), and this keeps the date-window fix
// below in exactly one place instead of two copies that could drift apart.
async function countAttemptsSince(
  db: D1Database,
  column: 'email' | 'ip_hash',
  value: string,
  sinceIso: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) as count FROM exam_attempts WHERE ${column} = ? AND started_at >= ?`)
    .bind(value, sinceIso)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function handleExamSubmit(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));

  // Requiring an explicit application/json content-type (rather than
  // accepting whatever request.json() can parse) is what actually makes the
  // origin allowlist above meaningful for a *browser* caller: text/plain is
  // one of the CORS "simple request" content-types a browser will send
  // without a preflight, which would otherwise let a page on any origin
  // reach this handler at all, allowlist or not. This does nothing against
  // a direct, non-browser caller (curl, a script) setting this header
  // themselves -- that's inherent to any public, unauthenticated endpoint.
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
    return Response.json({ error: 'Content-Type must be application/json' }, { status: 415, headers: cors });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
  }

  const { email: rawEmail, answers } = (body && typeof body === 'object' ? body : {}) as {
    email?: unknown;
    answers?: unknown;
  };
  // Normalize BEFORE validating, not after: EMAIL_PATTERN's [^\s@]+ segments
  // reject any whitespace, so a legitimate 'user@example.com ' (trailing
  // space from autofill/copy-paste) would otherwise fail validation even
  // though it's valid once trimmed. Lowercasing also matters downstream:
  // SQLite string equality is case-sensitive, so 'User@Example.com' and
  // 'user@example.com' would otherwise count as different rate-limit
  // identities and trivially defeat the per-email cap below.
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    return Response.json({ error: 'A valid email is required' }, { status: 400, headers: cors });
  }

  // CF-Connecting-IP is set by Cloudflare's edge for all genuine production
  // traffic; it's realistically only absent in local dev or non-edge
  // invocations. Rather than bucket every such caller into one shared
  // 'unknown' identity (which would let them rate-limit each other), just
  // skip the IP-based check when there's no real IP to key on -- the
  // per-email check below still applies regardless.
  const ip = request.headers.get('CF-Connecting-IP');
  const ipHash = ip ? await hashIp(ip) : null;

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [emailAttempts, ipAttempts] = await Promise.all([
    countAttemptsSince(env.DB, 'email', email, sinceIso),
    ipHash ? countAttemptsSince(env.DB, 'ip_hash', ipHash, sinceIso) : Promise.resolve(0),
  ]);

  // Known limitation: this check and the INSERT below aren't atomic (two
  // separate round-trips), so a deliberately concurrent burst of requests
  // from the same caller could each pass the check before any of their own
  // inserts land, slipping past the cap. Acceptable for a free course's
  // practice-exam abuse control today; a real fix would need a D1
  // uniqueness constraint with retry, or a Durable Object as the source of
  // truth for the counter, either of which is more machinery than this
  // deserves right now.
  if (emailAttempts >= MAX_ATTEMPTS_PER_EMAIL_PER_DAY || ipAttempts >= MAX_ATTEMPTS_PER_IP_PER_DAY) {
    return Response.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: cors });
  }

  // Scored purely server-side against exam.ts's private answer key -- the
  // client-supplied `answers` are never trusted beyond "which option index
  // did they pick per question id", and only the aggregate result below
  // (never per-question correctness) is ever returned.
  const result = scoreSubmission(answers);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO exam_attempts (email, started_at, completed_at, score, total_questions, passed, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(email, now, now, result.score, result.total, result.passed ? 1 : 0, ipHash)
    .run();

  return Response.json(result, { headers: cors });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' });
    }

    // Preflight for the /exam/* routes below -- a cross-origin POST with a
    // JSON content-type triggers a browser preflight before the real request.
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/exam/')) {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
    }

    if (url.pathname === '/exam/questions' && request.method === 'GET') {
      return Response.json(
        { questions: publicQuestions(), passThreshold: EXAM_PASS_THRESHOLD },
        { headers: corsHeaders(request.headers.get('Origin')) },
      );
    }

    if (url.pathname === '/exam/submit' && request.method === 'POST') {
      return handleExamSubmit(request, env);
    }

    const verifyMatch = url.pathname.match(/^\/verify\/([A-Za-z0-9_-]+)$/);
    if (verifyMatch) {
      const id = verifyMatch[1] as string;
      const cred = await env.DB.prepare(
        `SELECT id, email, course_slug, score, total_questions, issued_at, badge_status, badge_url
         FROM credentials WHERE id = ?`,
      )
        .bind(id)
        .first<CredentialRow>();

      return cred ? credentialPage(cred) : notFoundPage(id);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
