import { defineConfig } from 'vitest/config';

// `npm run eval:ben`: scores Ben's routing with the real embedder. Kept out of
// `npm test` because it needs the 23 MB model (fetched by `npm run ben:index`).
export default defineConfig({
  test: {
    include: ['evals/**/*.eval.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
