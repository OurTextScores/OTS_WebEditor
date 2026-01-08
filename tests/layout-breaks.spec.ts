import { expect, test } from 'playwright/test';

test('new line/page buttons toggle layout breaks on selection', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readMscx = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
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

  await page.getByTestId('btn-new-line').click();

  await expect
    .poll(async () => countSubtype(await readMscx(), 'line'), { timeout: 20_000 })
    .toBeGreaterThan(lineBefore);

  await page.getByTestId('btn-new-page').click();

  await expect
    .poll(async () => countSubtype(await readMscx(), 'page'), { timeout: 20_000 })
    .toBeGreaterThan(pageBefore);
});
