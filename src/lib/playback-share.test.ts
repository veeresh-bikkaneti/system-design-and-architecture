import { describe, expect, it, vi } from 'vitest';

import { createPlaybackShare, quantizeProgress } from './playback-share';

describe('createPlaybackShare', () => {
  it('starts idle', () => {
    expect(createPlaybackShare().getStatus()).toBe('idle');
  });

  it('publishes status changes to subscribers', () => {
    const share = createPlaybackShare();
    const seen: string[] = [];
    share.subscribe((s) => seen.push(s));
    share.setStatus('playing');
    share.setStatus('paused');
    expect(seen).toEqual(['playing', 'paused']);
    expect(share.getStatus()).toBe('paused');
  });

  it('does not notify when the status is unchanged', () => {
    const share = createPlaybackShare();
    const listener = vi.fn();
    share.subscribe(listener);
    share.setStatus('idle');
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribing stops notifications', () => {
    const share = createPlaybackShare();
    const listener = vi.fn();
    const unsub = share.subscribe(listener);
    unsub();
    share.setStatus('playing');
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies every subscriber', () => {
    const share = createPlaybackShare();
    const a = vi.fn();
    const b = vi.fn();
    share.subscribe(a);
    share.subscribe(b);
    share.setStatus('playing');
    expect(a).toHaveBeenCalledWith('playing');
    expect(b).toHaveBeenCalledWith('playing');
  });

  it('toggle() delegates to the registered player toggle', () => {
    const share = createPlaybackShare();
    const toggle = vi.fn();
    share.registerToggle(toggle);
    share.toggle();
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('re-registering replaces the previous toggle', () => {
    const share = createPlaybackShare();
    const first = vi.fn();
    const second = vi.fn();
    share.registerToggle(first);
    share.registerToggle(second);
    share.toggle();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('toggle() is a no-op when nothing is registered', () => {
    const share = createPlaybackShare();
    expect(() => share.toggle()).not.toThrow();
    share.registerToggle(vi.fn());
    share.registerToggle(null);
    expect(() => share.toggle()).not.toThrow();
  });

  it('models the player/floating-button agreement contract', () => {
    // Simulates: neural player publishes 'playing', the floating button
    // observes it, the learner taps the floating button, the player's
    // toggle runs and publishes 'paused' — both controls always agree.
    const share = createPlaybackShare();
    let playerStatus: 'idle' | 'playing' | 'paused' = 'idle';
    const observed: string[] = [];
    share.subscribe((s) => observed.push(s));
    share.registerToggle(() => {
      playerStatus = playerStatus === 'playing' ? 'paused' : 'playing';
      share.setStatus(playerStatus);
    });

    share.setStatus('playing'); // player starts
    playerStatus = 'playing';
    share.toggle(); // floating button tapped
    expect(playerStatus).toBe('paused');
    expect(share.getStatus()).toBe('paused');
    expect(observed).toEqual(['playing', 'paused']);
  });
});

describe('createPlaybackShare seek bridge', () => {
  it('starts with no seek available and a stable snapshot', () => {
    const share = createPlaybackShare();
    expect(share.getSeek()).toEqual({ canPrev: false, canNext: false });
    expect(share.getSeek()).toBe(share.getSeek());
  });

  it('notifies seek subscribers only when availability changes', () => {
    const share = createPlaybackShare();
    const listener = vi.fn();
    share.subscribeSeek(listener);
    share.setSeek({ canPrev: false, canNext: false });
    expect(listener).not.toHaveBeenCalled();
    share.setSeek({ canPrev: false, canNext: true });
    expect(listener).toHaveBeenCalledTimes(1);
    share.setSeek({ canPrev: false, canNext: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(share.getSeek()).toEqual({ canPrev: false, canNext: true });
  });

  it('keeps the snapshot identity between equal publishes', () => {
    const share = createPlaybackShare();
    share.setSeek({ canPrev: true, canNext: true });
    const first = share.getSeek();
    share.setSeek({ canPrev: true, canNext: true });
    expect(share.getSeek()).toBe(first);
  });

  it('seek publishes do not disturb status subscribers', () => {
    const share = createPlaybackShare();
    const status = vi.fn();
    share.subscribe(status);
    share.setSeek({ canPrev: true, canNext: true });
    expect(status).not.toHaveBeenCalled();
  });

  it('unsubscribing stops seek notifications', () => {
    const share = createPlaybackShare();
    const listener = vi.fn();
    share.subscribeSeek(listener)();
    share.setSeek({ canPrev: true, canNext: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it('seekToBlock and step delegate to the registered handlers', () => {
    const share = createPlaybackShare();
    const toBlock = vi.fn();
    const step = vi.fn();
    share.registerSeek({ toBlock, step });
    expect(share.seekToBlock(7)).toBe(true);
    expect(share.step(-1)).toBe(true);
    expect(share.step(1)).toBe(true);
    expect(toBlock).toHaveBeenCalledWith(7);
    expect(step.mock.calls).toEqual([[-1], [1]]);
  });

  it('reports false (and does nothing) when no handlers are registered', () => {
    const share = createPlaybackShare();
    expect(share.seekToBlock(3)).toBe(false);
    expect(share.step(1)).toBe(false);
    share.registerSeek({ toBlock: vi.fn(), step: vi.fn() });
    share.registerSeek(null);
    expect(share.seekToBlock(3)).toBe(false);
  });
});

describe('playback progress', () => {
  it('starts null and publishes quantized, clamped fractions', () => {
    const share = createPlaybackShare();
    expect(share.getProgress()).toBeNull();
    share.setProgress(0.5);
    expect(share.getProgress()).toBe(0.5);
    share.setProgress(7);
    expect(share.getProgress()).toBe(1);
    share.setProgress(-1);
    expect(share.getProgress()).toBe(0);
    share.setProgress(null);
    expect(share.getProgress()).toBeNull();
  });

  it('ignores NaN/Infinity', () => {
    expect(quantizeProgress(Number.NaN)).toBeNull();
    expect(quantizeProgress(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('notifies only when the quantized value changes', () => {
    const share = createPlaybackShare();
    const listener = vi.fn();
    share.subscribeProgress(listener);
    share.setProgress(0.5);
    share.setProgress(0.5001); // same 0.5% step
    share.setProgress(0.6);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribing stops progress notifications', () => {
    const share = createPlaybackShare();
    const listener = vi.fn();
    share.subscribeProgress(listener)();
    share.setProgress(0.3);
    expect(listener).not.toHaveBeenCalled();
  });
});
