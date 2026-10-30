import { defineConfig } from 'playwright/test';

const PLAYWRIGHT_PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT || '3000', 10);
const PLAYWRIGHT_BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PLAYWRIGHT_PORT}`;
const PLAYWRIGHT_BUNDLER = process.env.PLAYWRIGHT_BUNDLER || 'webpack';
if (!['webpack', 'turbopack'].includes(PLAYWRIGHT_BUNDLER)) {
  throw new Error(`Unsupported PLAYWRIGHT_BUNDLER: ${PLAYWRIGHT_BUNDLER}`);
}
const PLAYWRIGHT_DIST_DIR = `.next-dev-playwright-${PLAYWRIGHT_PORT}-${PLAYWRIGHT_BUNDLER}`;

export default defineConfig({
  testDir: './tests',
  // These suites have dedicated execution contracts and are intentionally not part of
  // the credential-free editor matrix. The embed suite (embed-integration and the scanner
  // rows height spec) needs its static-build server and host page (playwright.config.embed.ts,
  // npm run test:embed:integration); the music API smoke suite needs external tooling and
  // provider dependencies (npm run test:e2e:music).
  testIgnore: [
    'embed-integration.spec.ts',
    'scanner-rows-embed-height.spec.ts',
    'music-api-smoke.spec.ts',
  ],
  workers: 1,
  // `line` prints each failure with its error as it happens, not only after the whole run.
  reporter: process.env.CI ? 'dot' : 'line',
  timeout: 2 * 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Cross-browser qualification: PLAYWRIGHT_BROWSER=firefox|webkit (default chromium).
    browserName:
      (process.env.PLAYWRIGHT_BROWSER as 'chromium' | 'firefox' | 'webkit' | undefined) ??
      'chromium',
    // WebKit (WPE) hangs on its first page under WSL without a GPU render device; software GL works.
    ...(process.env.PLAYWRIGHT_BROWSER === 'webkit'
      ? { launchOptions: { env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' } } }
      : {}),
    // Stock Firefox over WebDriver BiDi (PLAYWRIGHT_FIREFOX_EXECUTABLE=/path/to/firefox). Playwright's own Firefox build
    // has no optimizing WebAssembly compiler, so its timings are 5-10x off; stock Firefox matches what users run.
    ...(process.env.PLAYWRIGHT_BROWSER === 'firefox' && process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE
      ? {
          channel: 'moz-firefox',
          launchOptions: { executablePath: process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE },
        }
      : {}),
  },
  webServer: {
    // Next's dev manifest loader occasionally receives incomplete JSON in CI.
    // Instrument this server only; preserve any NODE_OPTIONS supplied by CI.
    ...(process.env.CI ? { env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require=./scripts/diagnose-next-manifest.cjs` } } : {}),
    command: `npm run check:wasm && NEXT_DIST_DIR=${PLAYWRIGHT_DIST_DIR} npx next dev --${PLAYWRIGHT_BUNDLER} --hostname 127.0.0.1 --port ${PLAYWRIGHT_PORT}`,
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: true,
    timeout: 2 * 60 * 1000,
  },
});
