// @vitest-environment jsdom
/**
 * Seek behavior of the browser-speech engine, driven through the same
 * PlaybackShare bridge the floating button / read-from-here use, with a fully
 * faked speechSynthesis: block-level jumps while playing, paused and idle,
 * clean supersession of the in-flight utterance, and position persistence.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListenButton } from './ListenButton';
import { createPlaybackShare } from '../lib/playback-share';
import { useListenPositionStore } from '../store/listenPosition';

class FakeUtterance {
  text: string;
  rate = 1;
  voice: unknown = null;
  onstart: ((e: Event) => void) | null = null;
  onend: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onboundary: ((e: Event) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

let spoken: FakeUtterance[];
let synth: {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  getVoices: () => never[];
};
/** Order of platform calls, to pin dispose-before-cancel behavior. */
let calls: string[];

const last = () => spoken[spoken.length - 1];
const start = (u: FakeUtterance) => act(() => u.onstart?.({} as Event));

beforeEach(() => {
  spoken = [];
  calls = [];
  synth = {
    speak: vi.fn((u: FakeUtterance) => {
      calls.push('speak');
      spoken.push(u);
    }),
    cancel: vi.fn(() => calls.push('cancel')),
    pause: vi.fn(),
    resume: vi.fn(() => calls.push('resume')),
    getVoices: () => [],
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  Element.prototype.scrollIntoView = vi.fn();
  document.body.innerHTML =
    '<div class="lesson-prose"><p>Alpha one.</p><p>Bravo two.</p><p>Charlie three.</p></div>';
  window.localStorage.clear();
  useListenPositionStore.setState({ positions: {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'speechSynthesis');
});

const mount = () => {
  const share = createPlaybackShare();
  render(<ListenButton slug="lesson-x" share={share} />);
  return share;
};

const positions = () => useListenPositionStore.getState().positions;

describe('ListenButton seek', () => {
  it('starts idle playback at the requested block', () => {
    const share = mount();
    act(() => {
      share.seekToBlock(2);
    });
    expect(last().text).toBe('Charlie three.');
    expect(share.getStatus()).toBe('playing');
  });

  it('jumps while playing: disposes before cancelling, then speaks the new block', () => {
    const share = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to this lesson' }));
    start(last());
    const old = last();
    calls.length = 0;
    act(() => {
      share.seekToBlock(2);
    });
    expect(calls).toEqual(['cancel', 'speak']);
    expect(last().text).toBe('Charlie three.');
    // The cancelled utterance's late error/end must not stop or advance us.
    act(() => {
      old.onerror?.({} as Event);
      old.onend?.({} as Event);
    });
    expect(share.getStatus()).toBe('playing');
    expect(spoken).toHaveLength(2);
  });

  it('persists the block being read and clears it when the lesson ends', () => {
    const share = mount();
    act(() => {
      share.seekToBlock(1);
    });
    start(last());
    expect(positions()['lesson-x']).toBe(1);
    act(() => last().onend?.({} as Event)); // -> block 2
    start(last());
    expect(positions()['lesson-x']).toBe(2);
    act(() => last().onend?.({} as Event)); // end of lesson
    expect(share.getStatus()).toBe('idle');
    expect(positions()['lesson-x']).toBeUndefined();
  });

  it('starting from the beginning forgets an old resume point', () => {
    useListenPositionStore.getState().setPosition('lesson-x', 2);
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to this lesson' }));
    start(last());
    expect(positions()['lesson-x']).toBeUndefined();
  });

  it('steps with previous/next, publishes availability, and stops at the edges', () => {
    const share = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to this lesson' }));
    start(last());
    expect(share.getSeek()).toEqual({ canPrev: false, canNext: true });
    act(() => {
      share.step(1);
    });
    expect(last().text).toBe('Bravo two.');
    expect(share.getSeek()).toEqual({ canPrev: true, canNext: true });
    act(() => {
      share.step(1);
    });
    expect(last().text).toBe('Charlie three.');
    expect(share.getSeek()).toEqual({ canPrev: true, canNext: false });
    const before = spoken.length;
    act(() => {
      share.step(1);
    });
    expect(spoken).toHaveLength(before);
    act(() => {
      share.step(-1);
    });
    expect(last().text).toBe('Bravo two.');
  });

  it('reacts to ←/→ while active but not while idle', () => {
    mount();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(spoken).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to this lesson' }));
    start(last());
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(last().text).toBe('Bravo two.');
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(last().text).toBe('Alpha one.');
  });

  it('seeks while paused: position moves, nothing speaks until resume', () => {
    const share = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to this lesson' }));
    start(last());
    fireEvent.click(screen.getByRole('button', { name: 'Pause listening' }));
    expect(share.getStatus()).toBe('paused');
    const spokenBefore = spoken.length;
    act(() => {
      share.seekToBlock(2);
    });
    expect(spoken).toHaveLength(spokenBefore);
    expect(share.getStatus()).toBe('paused');
    expect(positions()['lesson-x']).toBe(2);
    expect(document.querySelectorAll('.narr-block-active')).toHaveLength(1);
    expect(document.querySelectorAll('p')[2].classList.contains('narr-block-active')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Resume listening' }));
    expect(last().text).toBe('Charlie three.');
    expect(share.getStatus()).toBe('playing');
  });

  it('keeps only the target block highlighted after a jump and scrolls it into view', () => {
    const share = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to this lesson' }));
    start(last());
    act(() => {
      share.seekToBlock(2);
    });
    const marked = document.querySelectorAll('.narr-block-active');
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toBe('Charlie three.');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('clamps an out-of-range block to the last one', () => {
    const share = mount();
    act(() => {
      share.seekToBlock(99);
    });
    expect(last().text).toBe('Charlie three.');
  });

  it('leaves no watchdog behind after a jump', () => {
    vi.useFakeTimers();
    try {
      const share = mount();
      act(() => {
        share.seekToBlock(0);
      });
      // Not started yet (watchdog armed) -> seek again, superseding it.
      act(() => {
        share.seekToBlock(1);
      });
      start(last());
      synth.cancel.mockClear();
      act(() => {
        vi.advanceTimersByTime(20000);
      });
      // Neither the superseded run's watchdog nor the live one (it started)
      // may cancel/retry anything.
      expect(synth.cancel).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes paragraph buttons in the chrome only while active', () => {
    mount();
    expect(screen.queryByRole('button', { name: 'Next paragraph' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to this lesson' }));
    start(last());
    // Pill + compact-popover copies both exist in the DOM once open; the pill's is always rendered.
    expect(screen.getAllByRole('button', { name: 'Next paragraph' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Next paragraph' })[0]);
    expect(last().text).toBe('Bravo two.');
  });
});
