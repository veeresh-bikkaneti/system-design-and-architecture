import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';

// Plain language, no boilerplate that does not match reality. Every claim
// below was checked against the shipped behavior: progress in browser
// storage, Ben on-device, gist sync from the browser (see
// src/lib/gist-sync.ts — the token never leaves the visitor's browser for
// a course server), feedback delivered to a private Discord channel,
// and Veer questions sent to the course server (deleted after 30 days).
export function PrivacyPage() {
  return (
    <>
      <Seo
        title="Privacy | System Design Mastery"
        description="What System Design Mastery collects (almost nothing), what the optional sign-in and feedback form do with your data, and what Cloudflare Turnstile sees."
        path="/privacy"
      />
      <h1 className="font-display text-3xl font-bold tracking-tight text-stone-950 dark:text-stone-50">
        Privacy
      </h1>
      <p className="mt-2 max-w-[65ch] text-sm text-stone-500 dark:text-stone-400">
        Short version: by default this course collects nothing about you.
        Three optional features can send something out: GitHub sign-in, the
        feedback form, and Veer, the signed-in tutor. Each section says
        exactly what it sends and where it goes.
      </p>

      <div className="mt-8 max-w-[65ch] space-y-8">
        <section>
          <h2 className="font-display text-xl font-semibold text-stone-950 dark:text-stone-50">
            What we do not collect
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            By default the course collects nothing: your progress and quiz
            scores stay in your own browser, Ben the tutor runs on your
            device, and no account is needed to read any lesson. No analytics
            product is used on this site.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-stone-950 dark:text-stone-50">
            GitHub sign-in (optional)
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            If you sign in with GitHub, your progress syncs to a private gist
            in your own GitHub account. The sync runs in your browser — there
            is no course server that sees your gist contents — and the access
            token lives in session storage only, so it goes away when you
            close the tab.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-stone-950 dark:text-stone-50">
            Veer (optional)
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            Ben stays on your device. Veer is a separate choice, and only
            after you sign in. Questions you ask Veer are sent to this
            course&apos;s own server and are deleted after 30 days. Until you
            choose Veer, that question is not sent.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-stone-950 dark:text-stone-50">
            Feedback form (optional)
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            The <Link to="/contact" className="underline">contact form</Link> sends
            exactly what you type: a category, a message, and — only if you
            choose to give them — a name, an email address, and a lesson.
            Messages are delivered to a private Discord channel and stored
            under Discord&apos;s policies. A name or email you give is used
            only for a reply, never published. Rate limiting uses a hashed
            counter, never your raw IP address, in our own records.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-stone-950 dark:text-stone-50">
            Spam checks
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            The feedback form runs Cloudflare Turnstile to block bots.
            Turnstile sends Cloudflare your IP address and signals from your
            browser (TLS fingerprint, user-agent, and the site key with its
            origin) for bot verification only — not for tracking or
            advertising. Details are in{' '}
            <a
              href="https://developers.cloudflare.com/turnstile/reference/turnstile-privacy-addendum/"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              Cloudflare&apos;s Turnstile Privacy Addendum
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-stone-950 dark:text-stone-50">
            Hosting logs
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            GitHub Pages and Cloudflare Workers keep standard request logs —
            the usual host-level records, which include IP addresses. Those
            logs belong to the hosts, not to this course, and nothing in them
            is joined to your progress or your feedback.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-stone-950 dark:text-stone-50">
            Questions
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            Questions about this page? Use the{' '}
            <Link to="/contact" className="underline">contact form</Link> itself.
          </p>
        </section>
      </div>
    </>
  );
}
