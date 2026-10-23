import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isMainModule } from './is-main.mjs';

describe('isMainModule', () => {
  it('is true when argv[1] is this very file, in the native path form of the OS', () => {
    // On Windows argv[1] is `C:\...` while import.meta.url is `file:///C:/...`.
    expect(isMainModule(import.meta.url, fileURLToPath(import.meta.url))).toBe(true);
  });

  it('is false when another script is the entry point', () => {
    expect(isMainModule(import.meta.url, fileURLToPath(new URL('./other.mjs', import.meta.url)))).toBe(false);
  });

  it('is false when there is no entry script (REPL, -e)', () => {
    expect(isMainModule(import.meta.url, undefined)).toBe(false);
  });
});
