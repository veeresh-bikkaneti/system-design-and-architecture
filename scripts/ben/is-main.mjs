import { pathToFileURL } from 'node:url';

/**
 * Whether the module at `metaUrl` is the script node was started with.
 * Comparing `import.meta.url` to `file://${process.argv[1]}` is never true on
 * Windows (`file:///C:/x.mjs` vs `C:\x.mjs`), so a guarded script silently did
 * nothing there.
 */
export function isMainModule(metaUrl, argv1 = process.argv[1]) {
  return Boolean(argv1) && metaUrl === pathToFileURL(argv1).href;
}
