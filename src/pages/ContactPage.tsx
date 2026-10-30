import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { lessonManifest } from '../lib/lesson-manifest';

// Cloudflare Turnstile widget API, loaded on this page only (never
// sitewide). Declared loosely: the real shape comes from the Turnstile
// script, and the component tolerates its absence (script failed to load)
// by submitting without a token and letting the server decide.
interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

const inputClass =
  'mt-1 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50';

export function ContactPage() {
  const [searchParams] = useSearchParams();
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  const workerUrl = import.meta.env.VITE_WORKER_URL?.trim();

  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [lesson, setLesson] = useState(() => {
    // Prefill only for a real lesson slug. Anything else (tampered,
    // mistyped, missing) blanks the field; the page still renders.
    const param = searchParams.get('lesson');
    return param && lessonManifest.some((m) => m.slug === param) ? param : '';
  });
  const [honeypot, setHoneypot] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');

  // First render, kept across retries: a retry after 3 seconds passes the
  // minimum-fill check with the same text, as the contract requires.
  // Lazy useState initializer (not useRef(Date.now())) so the purity lint
  // stays quiet: the value is computed once at mount, never re-rendered.
  const [startedAt] = useState(() => Date.now());
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !widgetContainerRef.current) return;
    const container = widgetContainerRef.current;
    const renderWidget = () => {
      const api = window.turnstile;
      if (!api) return;
      try {
        widgetIdRef.current = api.render(container, {
          sitekey: siteKey,
          callback: (tok: string) => setToken(tok),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
      } catch {
        // A failed render leaves the token empty; the submit path reports
        // it as a spam-check failure instead of a silent dead form.
      }
    };
    if (window.turnstile) {
      renderWidget();
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = renderWidget;
    script.onerror = () => {
      // No token will ever arrive; the submit path explains this plainly.
    };
    document.body.appendChild(script);
    return () => {
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {
        // Teardown must never break unmount.
      }
      script.remove();
    };
  }, [siteKey]);

  // Fresh token for the next submit: tokens are single-use, so a retry
  // must never resend a consumed one. Reset triggers a new challenge and
  // the callback above supplies the new token.
  const resetWidget = () => {
    try {
      const api = window.turnstile;
      if (api && widgetIdRef.current) api.reset(widgetIdRef.current);
    } catch {
      // Ignore: the next submit reports a missing token honestly.
    }
    setToken(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    if (!workerUrl) {
      setErrorText('Feedback is not available here right now.');
      setStatus('error');
      return;
    }
    setStatus('sending');
    setErrorText('');
    try {
      const payload: Record<string, unknown> = {
        category,
        message,
        turnstileToken: token ?? '',
        honeypot,
        startedAt,
      };
      if (name.trim() !== '') payload['name'] = name.trim();
      if (email.trim() !== '') payload['email'] = email.trim();
      if (lesson.trim() !== '') payload['lesson'] = lesson.trim();
      const res = await fetch(`${workerUrl.replace(/\/$/, '')}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus('success');
        setMessage('');
        setName('');
        setEmail('');
        setLesson('');
        setHoneypot('');
        resetWidget();
        return;
      }
      let serverText = '';
      try {
        const data = (await res.json()) as { error?: unknown };
        if (typeof data.error === 'string') serverText = data.error;
      } catch {
        // Non-JSON error body: fall through to the generic text below.
      }
      if (res.status === 429 || res.status === 502) {
        // The server's own wording for these two is already user-facing.
        setErrorText(serverText !== '' ? serverText : 'Something went wrong. Please try again.');
      } else if (res.status === 400 && token === null) {
        // No token reached the server: the spam check never ran.
        setErrorText('The spam check could not load, so your message was not sent. Please try again.');
      } else {
        setErrorText('Please check your message and try again.');
      }
      setStatus('error');
      resetWidget();
    } catch {
      setErrorText('Something went wrong. Please try again.');
      setStatus('error');
      resetWidget();
    }
  }

  return (
    <>
      <Seo
        title="Contact | System Design Mastery"
        description="Send feedback about System Design Mastery — bugs, lesson ideas, or anything else. No account needed."
        path="/contact"
      />
      <h1 className="font-display text-3xl font-bold tracking-tight text-stone-950 dark:text-stone-50">
        Contact
      </h1>
      <p className="mt-2 max-w-[65ch] text-sm text-stone-500 dark:text-stone-400">
        Tell us what is broken, what should be added, or anything else about
        the course. No account needed — anonymous feedback is welcome.
      </p>

      {status === 'success' && (
        <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
          Thanks — your feedback is on its way.
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {errorText}
        </p>
      )}
      {!siteKey && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          The spam check is not set up yet, so this form cannot send right now.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 max-w-[65ch] space-y-4">
        <div>
          <label className="text-sm font-medium text-stone-950 dark:text-stone-50">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
            >
              <option value="bug">Bug</option>
              <option value="lesson-idea">Lesson idea</option>
              <option value="general">General</option>
            </select>
          </label>
        </div>
        <div>
          <label className="text-sm font-medium text-stone-950 dark:text-stone-50">
            Message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className={inputClass}
            />
          </label>
        </div>
        <div>
          <label className="text-sm font-medium text-stone-950 dark:text-stone-50">
            Name (optional)
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div>
          <label className="text-sm font-medium text-stone-950 dark:text-stone-50">
            Email (optional)
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Email is optional. If you leave one, the owner may reply personally; no reply is guaranteed.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-stone-950 dark:text-stone-50">
            Lesson (optional)
            <input
              type="text"
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        {/* Honeypot: invisible to humans and to assistive tech, never in
            the tab order, never autofilled. A filled value rejects the
            submission server-side. */}
        <div
          aria-hidden="true"
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
        >
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>
        <div ref={widgetContainerRef} />
        <button
          type="submit"
          disabled={status === 'sending' || !siteKey}
          className="rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50 dark:bg-accent-500"
        >
          {status === 'sending' ? 'Sending…' : 'Send feedback'}
        </button>
      </form>

      <noscript>
        <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
          This form needs JavaScript to send feedback.
        </p>
      </noscript>

      <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">
        How feedback is handled: <Link to="/privacy" className="underline">Privacy</Link>
      </p>
    </>
  );
}
