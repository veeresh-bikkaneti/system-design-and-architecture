import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: {
      // Playwright's own browser download is blocked by the network proxy,
      // so use the Chromium shipped with the environment instead.
      executablePath: '/opt/meta-chromium/chrome',
      // Running as root in a container: Chrome's sandbox refuses to start.
      // --no-proxy-server: the environment's proxy env vars would otherwise
      // route localhost through the public proxy, which trips Chrome's Local
      // Network Access checks and blocks the test server.
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--no-proxy-server',
        // The environment's networking makes Chrome treat localhost targets
        // as local-network access from a public initiator; disable those
        // checks so the test server is reachable.
        '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
      ],
    },
  },
  webServer: {
    // Serves the production build so the smoke test exercises exactly what
    // would deploy. Rebuild with `npm run build` before running.
    command: 'npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
  },
});
