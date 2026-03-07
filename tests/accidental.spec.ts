import { expect, test } from 'playwright/test';

test('set accidental updates exported pitch alter', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readAlter = async (): Promise<number> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      const xml: string = await score.saveXml();
      return Number(xml.match(/<alter>(-?\d+)<\/alter>/)?.[1] ?? 0);
    });
  };

  await expect.poll(async () => await readAlter(), { timeout: 20_000 }).toBe(0);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await page.getByTestId('dropdown-accidental').click();
  await page.getByTestId('btn-acc-3').click(); // sharp
  await expect.poll(async () => await readAlter(), { timeout: 20_000 }).toBe(1);

  await page.getByTestId('dropdown-accidental').click();
  await page.getByTestId('btn-acc-0').click(); // clear
  await expect.poll(async () => await readAlter(), { timeout: 20_000 }).toBe(0);
});
