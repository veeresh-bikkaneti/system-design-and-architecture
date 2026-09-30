import { describe, expect, it, vi } from 'vitest';

import { createPlaybackShare } from './playback-share';

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
