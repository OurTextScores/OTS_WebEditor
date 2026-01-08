import { expect, test } from 'playwright/test';

test('tuplet adds a tuplet entry at selection', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readTupletCount = async (): Promise<number> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const bytes: Uint8Array = await score.saveMsc('mscx');
      const xml = new TextDecoder().decode(bytes);
      return (xml.match(/<Tuplet>/g) || []).length;
    });
  };

  const before = await readTupletCount();

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  const dropdown = page.getByTestId('dropdown-rhythm-voice');
  await dropdown.locator('summary').click();
  await dropdown.getByTestId('btn-tuplet-3').click();

  await expect.poll(readTupletCount, { timeout: 20_000 }).toBeGreaterThan(before);
});
