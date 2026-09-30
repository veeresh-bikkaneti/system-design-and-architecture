import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

/** Records the moment the heavy panel module is actually evaluated. */
const mockPanelEvaluated = vi.fn();

/**
 * Stand in for the heavy chat panel (react-markdown, the local agent, the
 * semantic layer). Because the shell reaches it only through a dynamic
 * import() inside React.lazy, this factory must not run until the user
 * opens the chat.
 */
vi.mock('./QaChatPanel', () => {
  mockPanelEvaluated();
  return { QaChatPanel: () => null };
});

describe('QaWidget shell code split', () => {
  it('renders the floating chat button on initial render', async () => {
    const { QaWidget } = await import('./QaWidget');
    const html = renderToString(createElement(QaWidget));
    // The button is the only thing a visitor sees before opening the chat.
    // (React escapes the & in the aria-label when rendering to HTML.)
    expect(html).toContain('aria-label="Open course Q');
    expect(html).toContain('aria-expanded="false"');
  });

  it('does not import the heavy panel module on initial render', async () => {
    const { QaWidget } = await import('./QaWidget');
    renderToString(createElement(QaWidget));
    // The dynamic import() must stay cold until the first open, so the
    // ~224 KB chat chunk is never fetched on page load.
    expect(mockPanelEvaluated).not.toHaveBeenCalled();
  });
});
