// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getBadgeById } from '../lib/badges';
import { useProgressStore } from '../store/progress';
import { BadgeDetailPage } from './BadgesPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BADGE_ID = 'lesson-scaling-web-service';
const BADGE_NAME = getBadgeById(BADGE_ID)?.name ?? 'Lesson Complete: Scaling';

function renderDetail(path: string, state: Record<string, unknown> = {}) {
  useProgressStore.setState({
    completedLessons: [],
    quizResults: {},
    seenBadges: [],
    celebratedBadges: [],
    ...state,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/badges/:id" element={<BadgeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function heroImg(container: HTMLElement) {
  return container.querySelector('.badge-hero img');
}

describe('BadgeDetailPage hero image failure', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('BH1: locked detail, img error hides art but keeps lock overlay + name + Locked pill + How to unlock', () => {
    const { container } = renderDetail(`/badges/${BADGE_ID}`);
    const img = heroImg(container);
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(heroImg(container)).toBeNull();
    expect(container.querySelector('.badge-hero__lock')).not.toBeNull();
    expect(screen.getByText(BADGE_NAME)).toBeTruthy();
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.getByText('How to unlock')).toBeTruthy();
  });

  it('BH2: unlocked detail, img error hides art but keeps name + Unlocked pill + LinkedIn buttons', () => {
    const { container } = renderDetail(`/badges/${BADGE_ID}`, {
      completedLessons: ['scaling-web-service'],
      celebratedBadges: [BADGE_ID],
    });
    const img = heroImg(container);
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(heroImg(container)).toBeNull();
    expect(screen.getByText(BADGE_NAME)).toBeTruthy();
    expect(screen.getByText('Unlocked')).toBeTruthy();
    expect(screen.getByText('Add to LinkedIn profile')).toBeTruthy();
    expect(screen.getByText('Share on LinkedIn')).toBeTruthy();
  });

  it('BH3: img error warns exactly once with the iconFile', () => {
    const { container } = renderDetail(`/badges/${BADGE_ID}`);
    fireEvent.error(heroImg(container)!);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('lesson.svg');
  });

  it('BH4: img loads, art stays visible and nothing is warned', () => {
    const { container } = renderDetail(`/badges/${BADGE_ID}`);
    const img = heroImg(container);
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toContain('lesson.svg');
    fireEvent.load(img!);
    expect(heroImg(container)).not.toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('BH5: unknown badge id shows Badge not found and renders no hero', () => {
    const { container } = renderDetail('/badges/no-such-badge');
    expect(screen.getByText('Badge not found')).toBeTruthy();
    expect(container.querySelector('.badge-hero')).toBeNull();
  });
});
