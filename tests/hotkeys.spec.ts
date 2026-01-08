import { expect, test } from 'playwright/test';

test('hotkeys drive delete, undo/redo, and copy/paste', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
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

  const readXml = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      return score.saveXml();
    });
  };

  const countNotes = (xml: string) => (xml.match(/<Note>/g) || []).length;
  const initial = countNotes(await readMscx());

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await page.keyboard.press('Delete');
  await expect.poll(async () => countNotes(await readMscx()), { timeout: 20_000 }).toBe(initial - 1);

  await page.keyboard.press('Control+Z');
  await expect.poll(async () => countNotes(await readMscx()), { timeout: 20_000 }).toBe(initial);

  await page.keyboard.press('Control+Y');
  await expect.poll(async () => countNotes(await readMscx()), { timeout: 20_000 }).toBe(initial - 1);

  await page.keyboard.press('Control+Z');
  await expect.poll(async () => countNotes(await readMscx()), { timeout: 20_000 }).toBe(initial);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await page.keyboard.press('Control+C');

  await page.locator('svg .Note').nth(1).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  const xmlBeforePaste = await readXml();
  await page.keyboard.press('Control+V');
  await expect.poll(async () => await readXml(), { timeout: 20_000 }).not.toBe(xmlBeforePaste);
});
