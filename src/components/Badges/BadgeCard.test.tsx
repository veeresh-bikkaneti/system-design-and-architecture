// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BadgeWithStatus } from '../../lib/badges';
import { BadgeCard } from './BadgeCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const UNLOCKED_BADGE: BadgeWithStatus = {
  id: 'lesson-scaling-web-service',
  kind: 'lesson',
  name: 'Lesson Complete: Scaling',
  description: 'Finished the scaling lesson.',
  criteria: 'Complete the scaling lesson.',
  iconFile: 'lesson.svg',
  unlocked: true,
};

const LOCKED_BADGE: BadgeWithStatus = {
  ...UNLOCKED_BADGE,
  unlocked: false,
};

function renderCard(badge: BadgeWithStatus) {
  return render(
    <MemoryRouter>
      <BadgeCard badge={badge} />
    </MemoryRouter>,
  );
}

describe('BadgeCard image failure', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('BG1: unlocked tile, img error hides art but keeps name + Unlocked pill', () => {
    const { container } = renderCard(UNLOCKED_BADGE);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Lesson Complete: Scaling')).toBeTruthy();
    expect(screen.getByText('Unlocked')).toBeTruthy();
  });

  it('BG2: img error warns exactly once with the iconFile', () => {
    const { container } = renderCard(UNLOCKED_BADGE);
    fireEvent.error(container.querySelector('img')!);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('lesson.svg');
  });

  it('BG3: img loads, art stays visible and nothing is warned', () => {
    const { container } = renderCard(UNLOCKED_BADGE);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toContain('lesson.svg');
    fireEvent.load(img!);
    expect(container.querySelector('img')).not.toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('BG4: locked tile, img error hides art but keeps lock overlay + name', () => {
    const { container } = renderCard(LOCKED_BADGE);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.badge-card__lock')).not.toBeNull();
    expect(screen.getByText('Lesson Complete: Scaling')).toBeTruthy();
  });
});
