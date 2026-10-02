// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createPlaybackShare } from '../lib/playback-share';
import { FloatingPlaybackButton } from './FloatingPlaybackButton';

const RING = 'playback-progress-ring';

afterEach(cleanup);

describe('FloatingPlaybackButton progress ring', () => {
  it('is absent while idle, even if a stale progress value exists', () => {
    const share = createPlaybackShare();
    share.setProgress(0.4);
    render(<FloatingPlaybackButton share={share} visible />);
    expect(screen.queryByTestId(RING)).toBeNull();
  });

  it('appears while playing and reflects progress in the tooltip', () => {
    const share = createPlaybackShare();
    render(<FloatingPlaybackButton share={share} visible />);
    act(() => {
      share.setStatus('playing');
      share.setProgress(0.25);
    });
    expect(screen.getByTestId(RING)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Pause listening' });
    expect(button.getAttribute('title')).toBe('Pause listening (25% through)');
  });

  it('keeps the accessible name stable as progress changes', () => {
    const share = createPlaybackShare();
    render(<FloatingPlaybackButton share={share} visible />);
    act(() => share.setStatus('playing'));
    act(() => share.setProgress(0.1));
    act(() => share.setProgress(0.9));
    expect(screen.getByRole('button', { name: 'Pause listening' })).toBeTruthy();
  });

  it('is hidden when the engine reports no progress', () => {
    const share = createPlaybackShare();
    render(<FloatingPlaybackButton share={share} visible />);
    act(() => share.setStatus('paused'));
    expect(screen.queryByTestId(RING)).toBeNull();
  });
});
