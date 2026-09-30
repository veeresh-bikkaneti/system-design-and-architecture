// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  findVisibleBadgesLink,
  resolveDismissFocusTarget,
} from '../../lib/badge-toast-focus';
import { usePausableDismiss } from './usePausableDismiss';

/**
 * P1-11 rework: behavioral coverage for the focus-engagement wiring in
 * `usePausableDismiss` and the dismiss focus fallback.
 *
 * The engagement counter lives in the React handlers (onFocus/onBlur),
 * not in PausableTimer (which is unit-tested separately and correct), so
 * these tests drive the real handler wiring with real focusin/focusout
 * events — including exact relatedTargets — under fake timers.
 */

const DELAY = 6000;

/** Minimal stand-in for a ToastItem: focusable link + dismiss button. */
function Harness({ onDismiss }: { onDismiss: () => void }) {
  const handlers = usePausableDismiss(DELAY, onDismiss);
  return (
    <div data-testid="toast" {...handlers}>
      <a data-testid="link" href="/badges/some-badge">
        Badge name
      </a>
      <button data-testid="dismiss" type="button">
        Dismiss
      </button>
    </div>
  );
}

function focusIn(el: Element, relatedTarget: EventTarget | null) {
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget }));
}

function focusOut(el: Element, relatedTarget: EventTarget | null) {
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('usePausableDismiss focus engagement (behavioral)', () => {
  it('pauses while focused and auto-dismisses after focus leaves', () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    const link = getByTestId('link');

    focusIn(link, null);
    vi.advanceTimersByTime(DELAY);
    expect(onDismiss).not.toHaveBeenCalled();

    focusOut(link, document.body);
    vi.advanceTimersByTime(DELAY);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('re-arms the timer after an intra-toast Tab sequence (the strand bug)', () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    const link = getByTestId('link');
    const dismissBtn = getByTestId('dismiss');

    // Focus arrives from outside the toast: one engagement, timer pauses.
    focusIn(link, null);
    vi.advanceTimersByTime(DELAY);
    expect(onDismiss).not.toHaveBeenCalled();

    // Tab from the link to the toast's own dismiss button: focus never
    // leaves the toast, so this must NOT count as a second engagement.
    // (Before the fix, onFocus engaged unconditionally here while onBlur
    // skipped the release, stranding the counter at 1 forever.)
    focusOut(link, dismissBtn);
    focusIn(dismissBtn, link);
    vi.advanceTimersByTime(DELAY);
    expect(onDismiss).not.toHaveBeenCalled();

    // Tab out of the toast entirely: the single engagement releases and
    // the timer re-arms — the toast eventually auto-dismisses.
    focusOut(dismissBtn, document.body);
    vi.advanceTimersByTime(DELAY - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not re-arm while focus is still inside the toast', () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    const link = getByTestId('link');
    const dismissBtn = getByTestId('dismiss');

    focusIn(link, null);
    focusOut(link, dismissBtn);
    focusIn(dismissBtn, link);
    // Focus is parked on the dismiss button: advancing far past the delay
    // must never dismiss from under the keyboard user.
    vi.advanceTimersByTime(DELAY * 10);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('dismiss focus fallback', () => {
  /** jsdom has no layout: give the "visible" link a painted rect. */
  function paint(el: HTMLElement, w = 24, h = 24) {
    el.getBoundingClientRect = () =>
      ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  }

  it('never targets a hidden badges link', () => {
    document.body.innerHTML = `
      <a href="/badges" id="hidden-link" style="display:none">Badges</a>
      <a href="/badges" id="visible-link">Badges</a>
    `;
    const hidden = document.getElementById('hidden-link') as HTMLElement;
    const visible = document.getElementById('visible-link') as HTMLElement;
    paint(visible);

    const picked = findVisibleBadgesLink();
    expect(picked).toBe(visible);
    expect(picked).not.toBe(hidden);
  });

  it('skips visibility:hidden badges links too', () => {
    document.body.innerHTML = `
      <a href="/badges" id="invisible-link" style="visibility:hidden">Badges</a>
      <a href="/badges" id="visible-link">Badges</a>
    `;
    const visible = document.getElementById('visible-link') as HTMLElement;
    paint(visible);
    expect(findVisibleBadgesLink()).toBe(visible);
  });

  it('falls back to the focusable main landmark when every badges link is hidden', () => {
    document.body.innerHTML = `
      <a href="/badges" style="display:none">Badges</a>
      <main id="main-content" tabindex="-1"></main>
    `;
    expect(findVisibleBadgesLink()).toBeNull();

    const main = document.getElementById('main-content') as HTMLElement;
    const target = resolveDismissFocusTarget(document, new Map(), [], 0);
    expect(target).toBe(main);

    // The landmark is genuinely focusable: focusing it never drops to <body>.
    target!.focus();
    expect(document.activeElement).toBe(main);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('prefers the next remaining toast’s controls over the badges link', () => {
    document.body.innerHTML = `<a href="/badges" id="badges-link">Badges</a>`;
    const badgesLink = document.getElementById('badges-link') as HTMLElement;
    paint(badgesLink);

    const toast2 = document.createElement('div');
    toast2.innerHTML = '<a href="/badges/x">Badge</a><button>Dismiss</button>';
    const els = new Map<number, HTMLDivElement | null>([[2, toast2]]);

    const target = resolveDismissFocusTarget(document, els, [{ key: 1 }, { key: 2 }], 1);
    expect(target).toBe(toast2.querySelector('a'));
  });

  it('uses the first remaining toast when the dismissed one was last', () => {
    const toast1 = document.createElement('div');
    toast1.innerHTML = '<button>Dismiss</button>';
    const els = new Map<number, HTMLDivElement | null>([[1, toast1]]);

    const target = resolveDismissFocusTarget(document, els, [{ key: 1 }], 1);
    expect(target).toBe(toast1.querySelector('button'));
  });
});
