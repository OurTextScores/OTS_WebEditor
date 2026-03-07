import { expect, test } from 'playwright/test';

test('add note control is not exposed in the toolbar', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const hasAddNoteApi = await page.evaluate(() => {
    return typeof (window as any).__webmscore?.addNoteFromRest === 'function';
  });
  test.skip(!hasAddNoteApi, 'Add Note API not available in this webmscore build');

  await expect(page.getByTestId('btn-add-note-top')).toHaveCount(0);
  await page.getByTestId('dropdown-rhythm').click();
  await expect(page.getByTestId('btn-add-note-dropdown')).toHaveCount(0);
});
