import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The worker has its own vitest setup (worker/vitest.config.ts) because
    // it is a separate package with its own lockfile and toolchain.
    exclude: ['**/node_modules/**', 'worker/**', 'dist/**', 'e2e/**'],
  },
});
