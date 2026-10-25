import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  // `line` prints each failure with its error as it happens, not only after the whole run.
  reporter: process.env.CI ? 'dot' : 'line',
  timeout: 2 * 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 2 * 60 * 1000,
  },
});
