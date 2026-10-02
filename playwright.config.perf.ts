import { defineConfig } from 'playwright/test';

/**
 * Edit-latency measurements (docs/private/VIRITURA_OTS_CROSS_POLLINATION.md §W7.1). Separate
 * from the functional suite because it loads a 30-page score, takes minutes, and its numbers
 * depend on the machine. Run with `npm run test:perf`; set PERF_ENFORCE=1 to turn the budgets
 * into failures.
 */
const PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT || '3000', 10);

export default defineConfig({
  testDir: './tests/perf',
  testMatch: /\.perf\.ts$/,
  workers: 1,
  timeout: 10 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  use: { baseURL: process.env.BASE_URL || `http://127.0.0.1:${PORT}`, headless: true },
  webServer: {
    command: `npm run check:wasm && NEXT_DIST_DIR=.next-dev-playwright-${PORT} npx next dev --webpack --hostname 127.0.0.1 --port ${PORT}`,
    url: process.env.BASE_URL || `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 2 * 60 * 1000,
  },
});
