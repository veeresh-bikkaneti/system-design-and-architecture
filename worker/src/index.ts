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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' });
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
