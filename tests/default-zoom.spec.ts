import { expect, test, type Page } from 'playwright/test';
import { runCommand } from './helpers/commands';

const zoomLabel = (page: Page) => page.getByTestId('zoom-preset-trigger').innerText();

async function openScore(page: Page) {
  await page.goto('/?score=/test_scores/two_staves_four_bars.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
}

test('a score opens fitted to the width of the view, whatever the window', async ({ page }) => {
  for (const width of [1400, 900]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.localStorage.clear()).catch(() => {});
    await openScore(page);
    // The fit lands within a few frames of the score appearing.
    await page.waitForTimeout(1200);
    const opened = await zoomLabel(page);
    await runCommand(page, 'view.zoom.fitWidth');
    await page.waitForTimeout(500);
    expect(opened, `at ${width}px`).toBe(await zoomLabel(page));
    expect(opened).not.toBe('100%');
  }
});
