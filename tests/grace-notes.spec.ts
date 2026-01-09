import { expect, test } from 'playwright/test';

test('acciaccatura adds a grace note to the selected note', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const graceCount = async (): Promise<number> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
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

  const dropdown = page.getByTestId('dropdown-grace-notes');
  await dropdown.locator('summary').click();
  await dropdown.getByTestId('btn-grace-acciaccatura').click();

  await expect.poll(graceCount, { timeout: 20_000 }).toBeGreaterThan(before);
});
