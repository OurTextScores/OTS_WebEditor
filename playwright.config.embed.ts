import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'embed-integration.spec.ts',
  workers: 1,
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
  },
  webServer: {
    command: 'node test-embed/server.js',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 30 * 1000,
  },
});
