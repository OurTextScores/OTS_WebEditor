import { defineConfig } from 'playwright/test';

const PLAYWRIGHT_PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT || '3000', 10);
const PLAYWRIGHT_BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PLAYWRIGHT_PORT}`;
const PLAYWRIGHT_DIST_DIR = `.next-dev-playwright-${PLAYWRIGHT_PORT}`;

export default defineConfig({
  testDir: './tests',
  // These suites have dedicated execution contracts and are intentionally not part of
  // the credential-free editor matrix. The embed suite needs its static-build server
  // (playwright.config.embed.ts); the music API smoke suite needs external tooling and
  // provider dependencies (npm run test:e2e:music).
  testIgnore: ['embed-integration.spec.ts', 'music-api-smoke.spec.ts'],
  workers: 1,
  timeout: 2 * 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    headless: true,
  },
  webServer: {
    command: `npm run check:wasm && NEXT_DIST_DIR=${PLAYWRIGHT_DIST_DIR} npx next dev --webpack --hostname 127.0.0.1 --port ${PLAYWRIGHT_PORT}`,
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: true,
    timeout: 2 * 60 * 1000,
  },
});
