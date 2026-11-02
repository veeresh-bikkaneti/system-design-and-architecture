// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatMarkdown } from './ChatMarkdown';

afterEach(cleanup);

// QA R-26 (UNVERIFIED in the triage): do javascript:/data: hrefs survive rendering?
describe('ChatMarkdown link protocols', () => {
  it('renders no javascript: or data: anchor from model output', () => {
    const { container } = render(
      <ChatMarkdown content={'[click](javascript:alert(1)) and [x](data:text/html,<script>alert(1)</script>)'} />,
    );
    const bad = Array.from(container.querySelectorAll('a')).filter((a) => /^\s*(javascript|data|vbscript):/i.test(a.getAttribute('href') ?? ''));
    expect(bad.map((a) => a.getAttribute('href'))).toEqual([]);
  });
  it('still renders an https link', () => {
    const { container } = render(<ChatMarkdown content="[docs](https://example.com/a)" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
  });
});
