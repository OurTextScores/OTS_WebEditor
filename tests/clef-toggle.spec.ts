import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand } from './helpers/commands';

test('clef can toggle and revert', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const readConcertClefTypes = async (): Promise<string[]> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const bytes: Uint8Array = await score.saveMsc('mscx');
      const xml = new TextDecoder().decode(bytes);
      return Array.from(xml.matchAll(/<concertClefType>([^<]+)<\/concertClefType>/g)).map(
        (match) => match[1],
      );
    });
  };

  const initial = await readConcertClefTypes();
  expect(initial).toHaveLength(1);
  expect(initial[0]).toBeTruthy();

  await page.locator('svg .Note').nth(5).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await runCommand(page, 'btn-clef-0');
  await expect
    .poll(async () => await readConcertClefTypes(), { timeout: 20_000 })
    .toEqual([initial[0], 'G']);

  await runCommand(page, 'btn-clef-20');
  await expect
    .poll(async () => await readConcertClefTypes(), { timeout: 20_000 })
    .toEqual([initial[0], initial[0]]);
});
