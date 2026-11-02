// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatMarkdown } from './ChatMarkdown';

afterEach(cleanup);

// QA R-26 regression guard. Scope: markdown links with javascript:/data:/vbscript:
// protocols on react-markdown 10.1.0 (no urlTransform override in src). Not a
// claim about any other XSS vector.
describe('ChatMarkdown link protocols', () => {
  it('renders no javascript: or data: anchor from model output', () => {
    const { container } = render(
      <ChatMarkdown content={'[click](javascript:alert(1)) [u](JavaScript:alert(1)) [v](vbscript:msgbox(1)) and [x](data:text/html,<script>alert(1)</script>)'} />,
    );
    const bad = Array.from(container.querySelectorAll('a')).filter((a) => /^\s*(javascript|data|vbscript):/i.test(a.getAttribute('href') ?? ''));
    expect(bad.map((a) => a.getAttribute('href'))).toEqual([]);
  });
  it('still renders an https link', () => {
    const { container } = render(<ChatMarkdown content="[docs](https://example.com/a)" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
  });
});
