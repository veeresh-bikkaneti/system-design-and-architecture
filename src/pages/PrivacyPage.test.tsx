import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { PrivacyPage } from './PrivacyPage';

afterEach(() => {
  cleanup();
});

function renderPrivacy() {
  return render(
    <MemoryRouter initialEntries={['/privacy']}>
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// The page's prose is split across elements (links inside paragraphs), so
// section headings are asserted by role and body claims against the full
// rendered text. Removing any section removes its phrases, so these
// assertions guard the content, not just the headings.
describe('PrivacyPage', () => {
  it('renders the page with all six spec §7 sections', () => {
    renderPrivacy();
    expect(screen.getByRole('heading', { name: 'Privacy' })).toBeDefined();
    for (const name of [
      'What we do not collect',
      'GitHub sign-in (optional)',
      'Veer (optional)',
      'Feedback form (optional)',
      'Spam checks',
      'Hosting logs',
      'Questions',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeDefined();
    }
  });

  it('names Veer as a way a question leaves the browser, and does not call sign-in and the form the only exits', () => {
    const { container } = renderPrivacy();
    const text = container.textContent ?? '';
    expect(text).toContain(
      "Questions you ask Veer are sent to this course's own server.",
    );
    expect(text).not.toContain('the only ways anything leaves your browser');
  });

  it('states what is not collected and that no analytics product is used', () => {
    const { container } = renderPrivacy();
    const text = container.textContent ?? '';
    expect(text).toContain('collects nothing');
    expect(text).toContain('stay in your own browser');
    expect(text).toContain('runs on your device');
    expect(text).toContain('no account is needed');
    expect(text).toContain('No analytics product is used on this site.');
  });

  it('states the GitHub sign-in behavior: private gist, browser-only sync, session storage', () => {
    const { container } = renderPrivacy();
    const text = container.textContent ?? '';
    expect(text).toContain('private gist');
    expect(text).toContain('in your own GitHub account');
    expect(text).toContain('no course server');
    expect(text).toContain('session storage only');
  });

  it('states the feedback-form fields, private Discord storage, and reply-only use of name/email', () => {
    const { container } = renderPrivacy();
    const text = container.textContent ?? '';
    expect(text).toContain('exactly what you type');
    expect(text).toContain('private Discord channel');
    expect(text).toContain("Discord's policies");
    expect(text).toContain('only for a reply, never published');
    expect(text).toContain('hashed with a fixed, non-secret salt');
    expect(text).toContain('pseudonymous, not anonymous');
    expect(text).toContain('only for rate limiting');
    expect(text).toContain('not deleted automatically');
    expect(text).not.toContain('never your raw IP address');
  });

  it('states the corrected Turnstile disclosure and links the privacy addendum', () => {
    const { container } = renderPrivacy();
    const text = container.textContent ?? '';
    expect(text).toContain('Cloudflare Turnstile');
    expect(text).toContain('IP address');
    expect(text).toContain('bot verification only');
    expect(text).toContain('not for tracking');
    expect(text).toContain('not for tracking or advertising');
    const link = screen.getByRole('link', {
      name: "Cloudflare's Turnstile Privacy Addendum",
    });
    expect(link.getAttribute('href')).toBe(
      'https://developers.cloudflare.com/turnstile/reference/turnstile-privacy-addendum/',
    );
  });

  it('states the hosting-logs disclosure, including host-level IP addresses', () => {
    const { container } = renderPrivacy();
    const text = container.textContent ?? '';
    expect(text).toContain('GitHub Pages and Cloudflare Workers keep standard request logs');
    expect(text).toContain('include IP addresses');
  });

  it('routes questions to the contact form itself', () => {
    renderPrivacy();
    const links = screen.getAllByRole('link', { name: 'contact form' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/contact');
    }
  });
});

// One sentence, two renderings: the live page and the prerendered snapshot
// (scripts/seo/prerender.mjs) must say the same thing about Veer retention.
const VEER_RETENTION =
  'Otherwise a daily cleanup deletes your Veer questions 30 days after your last sign-in session expires; sessions last 30 days, so that is up to about 60 days after your last question.';

describe('PrivacyPage truth pass', () => {
  it('states Veer retention in the terms the code implements, and the New topic shortcut', () => {
    const { container } = renderPrivacy();
    const text = container.textContent ?? '';
    expect(text).toContain(VEER_RETENTION);
    expect(text).toContain('New topic');
    expect(text).not.toContain('deleted after 30 days');
  });

  it('says plainly that cleanup after sign-out is not verified', () => {
    const { container } = renderPrivacy();
    expect(container.textContent ?? '').toContain('have not verified');
  });

  it('prerendered snapshot carries the same retention sentence and the same intro wording as the page', () => {
    const src = readFileSync(resolve(__dirname, '../../scripts/seo/prerender.mjs'), 'utf8');
    expect(src).toContain(VEER_RETENTION);
    expect(src).not.toContain('are the only ways anything leaves your browser');
    expect(src).toContain('can send something out');
    expect(src).not.toContain('deleted after 30 days');
    const { container } = renderPrivacy();
    expect(container.textContent ?? '').toContain('can send something out');
  });

  it('discloses that the GitHub sign-in code exchange passes through the Worker', () => {
    const { container } = renderPrivacy();
    const text = container.textContent ?? '';
    expect(text).toContain('passes through the course');
    expect(text).toContain('client secret');
    expect(text).not.toContain('there is no course server');
  });

  it('states a deletion route for feedback messages that exists (the repo issue tracker)', () => {
    renderPrivacy();
    const link = screen.getByRole('link', { name: 'GitHub issue tracker' });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/veeresh-bikkaneti/system-design-and-architecture/issues',
    );
  });
});
