import { expect, test } from 'playwright/test';

test('add note control is available in the toolbar', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const hasAddNoteApi = await page.evaluate(() => {
    return typeof (window as any).__webmscore?.addNoteFromRest === 'function';
  });
  test.skip(!hasAddNoteApi, 'Add Note API not available in this webmscore build');

  const topLevel = page.getByTestId('btn-add-note-top');
  await expect(topLevel).toBeVisible();
  await expect(topLevel).toBeDisabled();

  const dropdown = page.getByTestId('dropdown-rhythm-voice');
  await dropdown.locator('summary').click();

  const addNoteButton = dropdown.getByTestId('btn-add-note-dropdown');
  await expect(addNoteButton).toBeVisible();
  await expect(addNoteButton).toBeDisabled();
});
