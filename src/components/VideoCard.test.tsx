// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoCard } from './VideoCard';

afterEach(cleanup);

const props = {
  videoId: 'dQw4w9WgXcQ',
  title: 'Test video',
  source: 'Test Channel',
  description: 'A description.',
};

describe('VideoCard inline playback', () => {
  it('renders a play button and no iframe before interaction', () => {
    render(<VideoCard {...props} />);
    expect(screen.getByRole('button', { name: 'Play video: Test video' })).not.toBeNull();
    expect(screen.queryByTitle('Test video')).toBeNull();
  });

  it('swaps the thumbnail for a youtube-nocookie iframe on click', () => {
    render(<VideoCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video: Test video' }));
    const frame = screen.getByTitle('Test video');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
    );
    expect(frame.hasAttribute('allowfullscreen')).toBe(true);
  });

  it('keeps a Watch on YouTube link pointing at the watch page', () => {
    render(<VideoCard {...props} />);
    const link = screen.getByRole('link', { name: 'Watch on YouTube: Test video' });
    expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('never embeds a malformed videoId; falls back to opening the watch page', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<VideoCard {...props} videoId={'not a valid id!'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video: Test video' }));
    expect(screen.queryByTitle('Test video')).toBeNull();
    expect(open).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=not a valid id!',
      '_blank',
      'noopener',
    );
    open.mockRestore();
  });

  it('compact variant also expands inline on click', () => {
    render(<VideoCard {...props} variant="compact" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video: Test video' }));
    const frame = screen.getByTitle('Test video');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });
});
