import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 2 * 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 2 * 60 * 1000,
  },
});
