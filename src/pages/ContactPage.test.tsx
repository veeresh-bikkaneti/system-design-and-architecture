// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactPage } from './ContactPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete (window as unknown as Record<string, unknown>)['turnstile'];
});

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubEnv('VITE_WORKER_URL', 'https://worker.example');
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000BB');
});

function mockTurnstile(token: string | null) {
  (window as unknown as Record<string, unknown>)['turnstile'] = {
    render: (
      _el: HTMLElement,
      opts: { callback: (t: string) => void },
    ) => {
      if (token) opts.callback(token);
      return 'widget-1';
    },
    reset: vi.fn(),
    remove: vi.fn(),
  };
}

function renderContact(initialEntry = '/contact') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/contact" element={<ContactPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const fillValid = () => {
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'The caching lesson has a broken diagram link.' },
  });
};

describe('ContactPage', () => {
  it('renders the form with labeled fields and the reply note', () => {
    mockTurnstile('test-token');
    renderContact();
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeDefined();
    expect(screen.getByLabelText('Category')).toBeDefined();
    expect(screen.getByLabelText('Message')).toBeDefined();
    expect(screen.getByLabelText('Name (optional)')).toBeDefined();
    expect(screen.getByLabelText('Email (optional)')).toBeDefined();
    expect(screen.getByLabelText('Lesson (optional)')).toBeDefined();
    expect(
      screen.getByText(
        'Email is optional. If you leave one, the owner may reply personally; no reply is guaranteed.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeDefined();
  });

  it('pre-fills the lesson from ?lesson= and blanks an unknown slug', () => {
    mockTurnstile('test-token');
    const { unmount } = renderContact('/contact?lesson=scaling-web-service');
    expect(
      (screen.getByLabelText('Lesson (optional)') as HTMLInputElement).value,
    ).toBe('scaling-web-service');
    unmount();
    cleanup();
    renderContact('/contact?lesson=not-a-lesson');
    expect((screen.getByLabelText('Lesson (optional)') as HTMLInputElement).value).toBe('');
  });

  it('keeps the honeypot hidden from assistive tech and out of the tab order', () => {
    mockTurnstile('test-token');
    const { container } = renderContact();
    const honeypot = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(honeypot).toBeDefined();
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.autocomplete).toBe('off');
  });

  it('carries a noscript note for JS-disabled visitors', () => {
    mockTurnstile('test-token');
    const { container } = renderContact();
    expect(container.querySelector('noscript')).not.toBeNull();
  });

  it('links to the privacy page under the form', () => {
    mockTurnstile('test-token');
    renderContact();
    const link = screen.getByRole('link', { name: 'Privacy' });
    expect(link.getAttribute('href')).toBe('/privacy');
  });

  it('submits an anonymous message and clears the form on success', async () => {
    mockTurnstile('test-token');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderContact();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByRole('status')).toBeDefined();
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://worker.example/api/feedback');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body['category']).toBe('general');
    expect(body['message']).toBe('The caching lesson has a broken diagram link.');
    expect(body['turnstileToken']).toBe('test-token');
    expect(body['honeypot']).toBe('');
    expect('name' in body).toBe(false);
    expect('email' in body).toBe(false);
    expect(typeof body['startedAt']).toBe('number');
  });

  it('keeps every field and re-enables the button on failure', async () => {
    mockTurnstile('test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'could not send, try again' }), { status: 502 })),
    );
    renderContact();
    fillValid();
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'bug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('could not send, try again');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(
      'The caching lesson has a broken diagram link.',
    );
    expect((screen.getByLabelText('Email (optional)') as HTMLInputElement).value).toBe(
      'ada@example.com',
    );
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('bug');
    expect((screen.getByRole('button', { name: 'Send feedback' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables the button while sending (double-submit guard)', async () => {
    mockTurnstile('test-token');
    let resolveFetch!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(() => pending));
    renderContact();
    fillValid();
    const button = screen.getByRole('button', { name: 'Send feedback' }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    resolveFetch(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    await screen.findByRole('status');
    expect(button.disabled).toBe(false);
  });

  it('shows the spam-check error and keeps the message when the widget failed to load', async () => {
    // No window.turnstile mock: the script element is injected but never
    // loads in jsdom, so the submit carries no token.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Invalid submission' }), { status: 400 })),
    );
    // The script is appended to document.body, outside the render container.
    renderContact();
    expect(
      document.querySelector('script[src*="challenges.cloudflare.com"]'),
    ).not.toBeNull();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('spam check could not load');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(
      'The caching lesson has a broken diagram link.',
    );
  });

  it('shows the rate-limit message on 429', async () => {
    mockTurnstile('test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'too many messages, try later' }), { status: 429 })),
    );
    renderContact();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('too many messages, try later');
  });

  it('shows a not-configured notice and disables submit when the site key is unset', () => {
    mockTurnstile('test-token');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    renderContact();
    expect(screen.getByText(/spam check is not set up/i)).toBeDefined();
    expect((screen.getByRole('button', { name: 'Send feedback' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a not-available error without posting when the worker URL is unset', async () => {
    mockTurnstile('test-token');
    vi.stubEnv('VITE_WORKER_URL', '');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderContact();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
