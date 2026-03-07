import { expect, test } from 'playwright/test';

test('staccato button toggles articulation on selected note', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const hasStaccato = async (): Promise<boolean> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const bytes: Uint8Array = await score.saveMsc('mscx');
      const xml = new TextDecoder().decode(bytes);
      return (
        xml.includes('<subtype>articStaccatoAbove</subtype>')
        || xml.includes('<subtype>articStaccatoBelow</subtype>')
      );
    });
  };

  expect(await hasStaccato()).toBe(false);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await page.getByTestId('dropdown-articulations').click();
  await page.getByTestId('btn-artic-articStaccatoAbove').click();
  await expect.poll(async () => await hasStaccato(), { timeout: 20_000 }).toBe(true);

  await page.getByTestId('dropdown-articulations').click();
  await page.getByTestId('btn-artic-articStaccatoAbove').click();
  await expect.poll(async () => await hasStaccato(), { timeout: 20_000 }).toBe(false);
});
