import { expect, test } from 'playwright/test';
for (let attempt = 1; attempt <= 40; attempt++) {
  test(`load batch score ${attempt}`, async ({ page }) => {
    page.on('console', (message) => { if (message.text().includes('WORKER_DIAG')) console.log(message.text()); });
    page.on('pageerror', (error) => console.log('PAGE_DIAG', error.stack || error.message));
    await page.goto('/?score=/test_scores/batch4_controls.musicxml');
    await expect(page.locator('svg .Note').first()).toBeVisible({ timeout: 60000 });
  });
}
