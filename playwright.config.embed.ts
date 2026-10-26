import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /(embed-integration|scanner-rows-embed-height)\.spec\.ts/,
  workers: 1,
  // `line` prints each failure with its error as it happens, not only after the whole run.
  reporter: process.env.CI ? 'dot' : 'line',
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    // Cross-browser qualification: PLAYWRIGHT_BROWSER=firefox|webkit (default chromium).
    browserName:
      (process.env.PLAYWRIGHT_BROWSER as 'chromium' | 'firefox' | 'webkit' | undefined) ??
      'chromium',
    ...(process.env.PLAYWRIGHT_BROWSER === 'webkit'
      ? { launchOptions: { env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' } } }
      : {}),
  },
  webServer: {
    command: 'node test-embed/server.js',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 30 * 1000,
  },
});
