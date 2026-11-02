import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// Council 2026-11-02 (PR #109), item 4: prove the service worker at the
// GitHub Pages SUBPATH. Run after a build made with
// VITE_BASE_PATH=/system-design-and-architecture/ (see pr-gates.yml);
// vite preview serves that build under the same base.
export const SUBPATH_BASE = '/system-design-and-architecture/';
const PORT = 4176;

export default defineConfig({
  ...baseConfig,
  testIgnore: undefined,
  testMatch: /.*\.subpath\.spec\.ts/,
  use: { ...baseConfig.use, baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}${SUBPATH_BASE}`,
    env: { VITE_BASE_PATH: SUBPATH_BASE },
    reuseExistingServer: false,
  },
});
