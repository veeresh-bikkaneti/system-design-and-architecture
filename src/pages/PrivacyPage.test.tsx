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
      'Feedback form (optional)',
      'Spam checks',
      'Hosting logs',
      'Questions',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeDefined();
    }
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
    expect(text).toContain('hashed');
    expect(text).toContain('never your raw IP address');
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
