// Ambient declarations for retrieval.test.ts only.
//
// The worker tsconfig restricts `types` to @cloudflare/workers-types, so
// node builtins have no types here. The test therefore avoids node:fs/path
// (file contents arrive via vitest `?raw` imports) and declares the tiny
// slice of node:sqlite it uses.

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module 'node:sqlite' {
  export interface StatementSync {
    run(...params: unknown[]): void;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
