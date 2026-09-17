import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// This sandbox ships a Chromium that Playwright should use when Playwright's
// own browser download is unavailable (blocked proxy). On CI and other
// machines the path doesn't exist, so Playwright falls back to its own
// downloaded Chromium.
const SANDBOX_CHROMIUM = '/opt/meta-chromium/chrome';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: {
      ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
      // Running as root in a container: Chrome's sandbox refuses to start.
      // --no-proxy-server: the sandbox's proxy env vars would otherwise
      // route localhost through the public proxy, which trips Chrome's Local
      // Network Access checks and blocks the test server.
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--no-proxy-server',
        // The sandbox's networking makes Chrome treat localhost targets
        // as local-network access from a public initiator; disable those
        // checks so the test server is reachable.
        '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
      ],
    },
  },
  webServer: {
    // Serves the production build so the smoke test exercises exactly what
    // would deploy. Rebuild with `npm run build` before running.
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    port: 4173,
    reuseExistingServer: true,
  },
});
