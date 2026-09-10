import { expect, test } from 'playwright/test';

test.use({ viewport: { width: 2400, height: 1600 } });

test('clef and grace-note menus use spaced Leland symbol rows', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  await page.getByTestId('dropdown-clef').click();
  const commonClefs = [0, 20, 10, 11].map((value) => page.getByTestId(`btn-clef-${value}`));
  const clefBoxes = await Promise.all(commonClefs.map((item) => item.boundingBox()));
  for (let index = 0; index < clefBoxes.length; index += 1) {
    const box = clefBoxes[index];
    expect(box?.height).toBeGreaterThanOrEqual(48);
    if (index > 0 && box && clefBoxes[index - 1]) {
      const previous = clefBoxes[index - 1]!;
      expect(box.y).toBeGreaterThanOrEqual(previous.y + previous.height);
    }
  }
  await expect(page.getByTestId('clef-symbol-10')).toHaveCSS('font-family', /LelandScoreToolbar/);

  await page.keyboard.press('Escape');
  await page.getByTestId('dropdown-grace-notes').click();
  await expect(page.getByTestId('grace-symbol-1')).toHaveCSS('font-family', /LelandNotesToolbar/);
  await expect(page.getByTestId('btn-grace-acciaccatura')).toContainText('Acciaccatura');
});
