import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeDiagram } from '../lib/mermaid-label';

/**
 * P1-10: mermaid diagrams get an accessible name and a text alternative.
 * `describeDiagram` is a pure function, so its mapping is unit-tested
 * directly; the render-region markup is pinned with a source contract
 * (same pattern as the mermaid animation contract test) since there is
 * no DOM test environment in this repo.
 */
describe('describeDiagram', () => {
  it.each([
    ['flowchart LR\n  A-->B', 'Flowchart'],
    ['flowchart TD\n  A-->B', 'Flowchart'],
    ['graph TD\n  A-->B', 'Flowchart'],
    ['sequenceDiagram\n  A->>B: hi', 'Sequence diagram'],
    ['stateDiagram-v2\n  [*] --> A', 'State diagram'],
    ['classDiagram\n  A <|-- B', 'Class diagram'],
    ['erDiagram\n  A ||--o{ B : has', 'Entity-relationship diagram'],
    ['gantt\n  title X', 'X — Gantt chart'],
    ['pie title X\n  "a" : 1', 'X — Pie chart'],
  ])('names %j as %j', (code, label) => {
    expect(describeDiagram(code)).toBe(label);
  });

  it.each([
    ['flowchart LR\n  accTitle: Signup flow\n  A-->B', 'Signup flow — Flowchart'],
    ['sequenceDiagram\n  title: Auth sequence\n  A->>B: hi', 'Auth sequence — Sequence diagram'],
    ['flowchart LR\n  title:Spaceless\n  A-->B', 'Spaceless — Flowchart'],
    ['gantt\n  title   Padded title  \n  section S', 'Padded title — Gantt chart'],
  ])('prefers an explicit title over the type name: %j', (code, label) => {
    expect(describeDiagram(code)).toBe(label);
  });

  it('keeps the type-based name when no title is declared', () => {
    expect(describeDiagram('flowchart LR\n  A-->B')).toBe('Flowchart');
    expect(describeDiagram('sequenceDiagram\n  A->>B: hi')).toBe('Sequence diagram');
  });

  it('does not mistake a node named "title" or a title comment for a directive', () => {
    expect(describeDiagram('flowchart LR\n  title["not a directive"]\n  A-->B')).toBe('Flowchart');
    expect(describeDiagram('flowchart LR\n  %% title: comment\n  A-->B')).toBe('Flowchart');
  });

  it('does not capture the next line when the title directive has an empty value', () => {
    expect(describeDiagram('flowchart LR\n  title:\n  A-->B')).toBe('Flowchart');
    expect(describeDiagram('flowchart LR\n  title:   \n  A-->B')).toBe('Flowchart');
    expect(describeDiagram('flowchart LR\n  accTitle:\n  A-->B')).toBe('Flowchart');
    expect(describeDiagram('sequenceDiagram\n  title:\n  A->>B: hi')).toBe('Sequence diagram');
  });

  it('does not capture the next line from a bare title after the type line', () => {
    expect(describeDiagram('pie\n  title\n  "a": 1')).toBe('Pie chart');
    expect(describeDiagram('gantt\n  title\n  section S')).toBe('Gantt chart');
  });

  it('falls back to a generic name for unknown sources', () => {
    expect(describeDiagram('something-weird\n  foo')).toBe('Diagram');
  });

  it('only matches the diagram type at the start of a line', () => {
    // "graphs will." in prose must not be read as a graph diagram.
    expect(describeDiagram('The graphs will.\n  keep going')).toBe('Diagram');
  });
});

describe('MermaidDiagram render region (source contract)', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'MermaidDiagram.tsx'),
    'utf8',
  );

  it('exposes the diagram as role="img" with a derived accessible name', () => {
    expect(src).toMatch(/role="img"/);
    expect(src).toMatch(/aria-label=\{describeDiagram\(code\)\}/);
  });

  it('provides a toggleable text alternative with the diagram source', () => {
    expect(src).toMatch(/<details/);
    expect(src).toMatch(/View diagram source/);
    expect(src).toMatch(/<pre[\s>][\s\S]*?\{code\}/);
  });
});
