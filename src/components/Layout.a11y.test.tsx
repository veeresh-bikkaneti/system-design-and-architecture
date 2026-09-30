// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';
import { ScrollToTop } from '../App';

afterEach(() => {
  // vitest runs without globals here, so RTL's automatic cleanup never
  // fires — unmount each render or duplicates pile up across tests.
  cleanup();
});

function renderLayout() {
  const utils = render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<div>Home page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  const dialog = utils.container.querySelector('[role="dialog"]') as HTMLElement;
  return { ...utils, dialog, wrapper: dialog.parentElement as HTMLElement };
}

beforeEach(() => {
  // jsdom has no scrolling viewport; silence the "not implemented" noise.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

describe('Layout mobile nav drawer accessibility', () => {
  it('closed drawer is inert and hidden from the accessibility tree', () => {
    const { wrapper } = renderLayout();
    // `inert` is what actually removes the closed drawer from the tab order
    // and the a11y tree — the old CSS-only (-translate-x-full) hiding did not.
    expect(wrapper.getAttribute('inert')).not.toBeNull();
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
  });

  it('opening moves focus into the drawer; Escape closes and returns focus', () => {
    const { wrapper } = renderLayout();
    const menuButton = screen.getByRole('button', { name: 'Open course navigation' });

    fireEvent.click(menuButton);

    // Drawer is now live: inert + aria-hidden lifted.
    expect(wrapper.getAttribute('inert')).toBeNull();
    expect(wrapper.getAttribute('aria-hidden')).toBe('false');
    // Focus moved into the dialog (first focusable = the close button).
    const closeButton = screen.getByRole('button', { name: 'Close course navigation' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: 'Escape' });

    // Drawer closed again and focus returned to the menu button that opened it.
    expect(wrapper.getAttribute('inert')).not.toBeNull();
    expect(document.activeElement).toBe(menuButton);
  });

  it('Tab cycles inside the open drawer (focus trap)', () => {
    const { dialog } = renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Open course navigation' }));

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Open puts focus on the first focusable element.
    expect(document.activeElement).toBe(first);

    // Shift+Tab on the first element wraps to the last.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Tab on the last element wraps to the first.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('skip link moves focus into the main landmark', () => {
    renderLayout();
    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });

    fireEvent.click(skipLink);

    const main = document.getElementById('main-content');
    expect(main).not.toBeNull();
    // The explicit focus() call (not just the #hash scroll) is what moves
    // the keyboard cursor out of the header.
    expect(document.activeElement).toBe(main);
  });
});

describe('ScrollToTop route-change focus (P1-7)', () => {
  function GoButton({ to, label }: { to: string; label: string }) {
    const navigate = useNavigate();
    return <button onClick={() => navigate(to)}>{label}</button>;
  }

  it('leaves focus alone on initial load but moves it to #main-content on route change', async () => {
    render(
      <MemoryRouter initialEntries={['/a']}>
        <ScrollToTop />
        <main id="main-content" tabIndex={-1}>
          page content
        </main>
        <Routes>
          <Route path="/a" element={<GoButton to="/b" label="go to b" />} />
          <Route path="/b" element={<div>Page B</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // Initial page load: the browser already owns the focus context, so
    // ScrollToTop must not steal it.
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(screen.getByRole('button', { name: 'go to b' }));

    // Route change: focus follows the scroll to the main landmark so
    // screen-reader users get a "new page" cue (with the document.title
    // change that Seo.tsx applies on navigation).
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById('main-content')),
    );
  });
});
