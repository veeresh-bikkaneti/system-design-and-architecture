// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadFromHere } from './ReadFromHere';
import { useSeekShortcuts } from './player/useSeekShortcuts';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function mountArticle() {
  const article = document.createElement('div');
  article.className = 'lesson-prose';
  article.innerHTML = `
    <h2 id="h">Heading</h2>
    <p id="p0">First <a id="link" href="#x">link</a> paragraph.</p>
    <pre id="code">const x = 1;</pre>
    <ul><li id="li"><p id="inner">Nested item.</p></li></ul>
  `;
  document.body.appendChild(article);
  return article;
}

const BTN = { name: 'Read aloud from this paragraph' };

describe('ReadFromHere', () => {
  it('shows a button on hover and starts at that block only when it is pressed', () => {
    mountArticle();
    const onSelect = vi.fn();
    render(<ReadFromHere articleSelector=".lesson-prose" enabled onSelect={onSelect} />);
    expect(screen.queryByRole('button', BTN)).toBeNull();

    fireEvent.pointerOver(document.getElementById('p0')!);
    const btn = screen.getByRole('button', BTN);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(btn);
    // blocks: h2 = 0, p0 = 1, li = 2 (the code block is skipped)
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('button', BTN)).toBeNull();
  });

  it('never hijacks clicks on the text or its links', () => {
    mountArticle();
    const onSelect = vi.fn();
    render(<ReadFromHere articleSelector=".lesson-prose" enabled onSelect={onSelect} />);
    fireEvent.pointerOver(document.getElementById('p0')!);
    const link = document.getElementById('link')!;
    const notPrevented = fireEvent.click(link);
    fireEvent.click(document.getElementById('p0')!);
    expect(notPrevented).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('resolves a nested paragraph to its outermost speakable block', () => {
    mountArticle();
    const onSelect = vi.fn();
    render(<ReadFromHere articleSelector=".lesson-prose" enabled onSelect={onSelect} />);
    fireEvent.pointerOver(document.getElementById('inner')!);
    fireEvent.click(screen.getByRole('button', BTN));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('offers nothing over skipped regions like code blocks', () => {
    mountArticle();
    render(<ReadFromHere articleSelector=".lesson-prose" enabled onSelect={vi.fn()} />);
    fireEvent.pointerOver(document.getElementById('code')!);
    expect(screen.queryByRole('button', BTN)).toBeNull();
  });

  it('is inert while disabled', () => {
    mountArticle();
    render(<ReadFromHere articleSelector=".lesson-prose" enabled={false} onSelect={vi.fn()} />);
    fireEvent.pointerOver(document.getElementById('p0')!);
    expect(screen.queryByRole('button', BTN)).toBeNull();
  });

  it('hides on Escape and after the pointer leaves for a moment', () => {
    vi.useFakeTimers();
    mountArticle();
    render(<ReadFromHere articleSelector=".lesson-prose" enabled onSelect={vi.fn()} />);
    fireEvent.pointerOver(document.getElementById('p0')!);
    expect(screen.queryByRole('button', BTN)).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', BTN)).toBeNull();

    fireEvent.pointerOver(document.getElementById('p0')!);
    fireEvent.pointerOver(document.body);
    expect(screen.queryByRole('button', BTN)).not.toBeNull(); // grace period
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByRole('button', BTN)).toBeNull();
  });

  it('removes its listeners on unmount', () => {
    mountArticle();
    const { unmount } = render(
      <ReadFromHere articleSelector=".lesson-prose" enabled onSelect={vi.fn()} />,
    );
    unmount();
    fireEvent.pointerOver(document.getElementById('p0')!);
    expect(screen.queryByRole('button', BTN)).toBeNull();
  });
});

describe('useSeekShortcuts', () => {
  const press = (init: KeyboardEventInit, target: Element | Document = document) =>
    fireEvent.keyDown(target, init);

  it('steps on plain arrow keys while active', () => {
    const onStep = vi.fn();
    renderHook(() => useSeekShortcuts(true, onStep));
    press({ key: 'ArrowLeft' });
    press({ key: 'ArrowRight' });
    expect(onStep.mock.calls).toEqual([[-1], [1]]);
  });

  it('does nothing while inactive', () => {
    const onStep = vi.fn();
    renderHook(() => useSeekShortcuts(false, onStep));
    press({ key: 'ArrowRight' });
    expect(onStep).not.toHaveBeenCalled();
  });

  it('ignores modifier combos and repeats', () => {
    const onStep = vi.fn();
    renderHook(() => useSeekShortcuts(true, onStep));
    press({ key: 'ArrowRight', altKey: true });
    press({ key: 'ArrowRight', shiftKey: true });
    press({ key: 'ArrowRight', metaKey: true });
    press({ key: 'ArrowRight', ctrlKey: true });
    press({ key: 'ArrowRight', repeat: true });
    expect(onStep).not.toHaveBeenCalled();
  });

  it('leaves inputs, textareas, contenteditable and sliders alone', () => {
    const onStep = vi.fn();
    renderHook(() => useSeekShortcuts(true, onStep));
    const input = document.createElement('input');
    const range = document.createElement('input');
    range.type = 'range';
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const slider = document.createElement('div');
    slider.setAttribute('role', 'slider');
    document.body.append(input, range, textarea, editable, slider);
    for (const el of [input, range, textarea, editable, slider]) {
      press({ key: 'ArrowLeft' }, el);
    }
    expect(onStep).not.toHaveBeenCalled();
  });

  it('prevents the default only for keys it handles', () => {
    renderHook(() => useSeekShortcuts(true, vi.fn()));
    expect(fireEvent.keyDown(document, { key: 'ArrowRight' })).toBe(false);
    expect(fireEvent.keyDown(document, { key: 'ArrowRight', altKey: true })).toBe(true);
  });

  it('uses the latest callback and unsubscribes on unmount', () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender, unmount } = renderHook(({ cb }) => useSeekShortcuts(true, cb), {
      initialProps: { cb: a },
    });
    rerender({ cb: b });
    press({ key: 'ArrowRight' });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    unmount();
    press({ key: 'ArrowRight' });
    expect(b).toHaveBeenCalledTimes(1);
  });
});
