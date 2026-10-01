import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand } from './helpers/commands';

test('new line/page buttons toggle layout breaks on selection', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readMscx = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const data = await score.saveMsc('mscx');
      return new TextDecoder().decode(data);
    });
  };

  const countSubtype = (xml: string, subtype: string) => {
    const re = new RegExp(`<subtype>${subtype}<\\/subtype>`, 'g');
    const matches = xml.match(re);
    return matches ? matches.length : 0;
  };

  const before = await readMscx();
  const lineBefore = countSubtype(before, 'line');
  const pageBefore = countSubtype(before, 'page');

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await runCommand(page, 'btn-new-line');

  await expect
    .poll(async () => countSubtype(await readMscx(), 'line'), { timeout: 20_000 })
    .toBe(lineBefore + 1);

  await runCommand(page, 'btn-new-line');

  await expect
    .poll(async () => countSubtype(await readMscx(), 'line'), { timeout: 20_000 })
    .toBe(lineBefore);

  await runCommand(page, 'btn-new-page');

  await expect
    .poll(async () => countSubtype(await readMscx(), 'page'), { timeout: 20_000 })
    .toBe(pageBefore + 1);

  await runCommand(page, 'btn-new-page');

  await expect
    .poll(async () => countSubtype(await readMscx(), 'page'), { timeout: 20_000 })
    .toBe(pageBefore);
});
