// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactPage } from './ContactPage';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete (window as unknown as Record<string, unknown>)['turnstile'];
});

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000BB');
});

function renderContact() {
  return render(
    <MemoryRouter initialEntries={['/contact']}>
      <Routes>
        <Route path="/contact" element={<ContactPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ContactPage turnstile cleanup', () => {
  it('removes an already-loaded widget when the page unmounts and on the next visit', () => {
    const remove = vi.fn();
    (window as unknown as Record<string, unknown>)['turnstile'] = {
      render: () => 'widget-1',
      reset: vi.fn(),
      remove,
    };

    const first = renderContact();
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeDefined();
    first.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('widget-1');

    const second = renderContact();
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeDefined();
    second.unmount();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenLastCalledWith('widget-1');
  });
});
