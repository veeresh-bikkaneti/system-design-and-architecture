import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source-level contract for the mermaid node entrance animation in
 * diagrams.css.
 *
 * Mermaid v12 positions every flowchart/state node with a
 * `transform="translate(x, y)"` attribute on the node `<g>`. A CSS
 * keyframe that animates the `transform` property overrides that
 * attribute for the animation's whole fill window (`both`), piling
 * every node at the origin as clipped slivers with edges dangling
 * between the intended positions — every flowchart on the site broke
 * this way after the mermaid 11 -> 12 bump (2026-09-24).
 *
 * The individual `translate` property composes *with* the attribute
 * instead of replacing it, so the rise-in effect keeps working without
 * moving nodes off their laid-out positions. These tests pin that
 * invariant: if someone rewrites the keyframes with `transform` again,
 * the suite fails here instead of on the live site.
 */
const cssPath = join(dirname(fileURLToPath(import.meta.url)), 'diagrams.css');
const css = readFileSync(cssPath, 'utf8');

function keyframesBlock(name: string): string {
  const start = css.indexOf(`@keyframes ${name}`);
  expect(start, `@keyframes ${name} must exist in diagrams.css`).toBeGreaterThan(-1);
  // Balanced-brace scan: the keyframes block ends at the matching close.
  let depth = 0;
  let end = start;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return css.slice(start, end);
}

describe('mermaid-node-in keyframes (diagrams.css)', () => {
  const block = keyframesBlock('mermaid-node-in');

  it('never animates the `transform` property (would clobber mermaid v12 node positioning)', () => {
    // Match `transform:` as a declaration, not `translate`/`rotate`/etc.
    expect(block).not.toMatch(/(^|[;{\s])transform\s*:/);
  });

  it('uses the individual `translate` property for the rise-in effect', () => {
    expect(block).toMatch(/(^|[;{\s])translate\s*:/);
  });

  it('ends at a neutral translate so the fill window is a no-op', () => {
    expect(block).toMatch(/translate\s*:\s*0(\s+0)?\s*;/);
  });
});
