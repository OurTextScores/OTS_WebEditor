import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand } from './helpers/commands';

test('acciaccatura adds a grace note to the selected note', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const graceCount = async (): Promise<number> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const bytes: Uint8Array = await score.saveMsc('mscx');
      const xml = new TextDecoder().decode(bytes);
      return (xml.match(/<acciaccatura/g) || []).length;
    });
  };

  const before = await graceCount();

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await runCommand(page, 'btn-grace-acciaccatura');

  await expect.poll(graceCount, { timeout: 20_000 }).toBeGreaterThan(before);
});
