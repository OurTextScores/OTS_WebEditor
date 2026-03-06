import { expect, test } from '@playwright/test';

const shouldIgnoreConsoleError = (text: string) => (
  text.includes('/api/analytics/events')
  || text.includes('Failed to load resource: the server responded with a status of 404')
);

test('editor boots without runtime exceptions', async ({ page }) => {
  const runtimeErrors: string[] = [];

  page.on('pageerror', (err) => {
    runtimeErrors.push(`pageerror: ${err.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') {
      return;
    }
    const text = msg.text();
    if (shouldIgnoreConsoleError(text)) {
      return;
    }
    runtimeErrors.push(`console:error: ${text}`);
  });

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  expect(response?.ok()).toBeTruthy();
  expect(runtimeErrors).toEqual([]);
});
