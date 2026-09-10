import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';

test('tie button adds a tie to the next same-pitch note', async ({ page }) => {
  await page.goto('/?score=/test_scores/two_notes_cc.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readXml = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      return score.saveXml();
    });
  };

  const xmlBefore = await readXml();
  expect(xmlBefore.includes('<tie type="start"') || xmlBefore.includes('<tied type="start"')).toBe(
    false,
  );

  const notes = page.locator('svg .Note');
  await notes.nth(0).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await page.getByTestId('dropdown-slur-tie').click();
  await page.getByTestId('btn-tie').click();

  await expect
    .poll(
      async () => {
        const xml = await readXml();
        const hasStart = xml.includes('<tie type="start"') || xml.includes('<tied type="start"');
        const hasStop = xml.includes('<tie type="stop"') || xml.includes('<tied type="stop"');
        return hasStart && hasStop;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
});
