import { expect, test } from './helpers/diagnostic-test';
import { openMenuPath } from './helpers/commands';

// Performer mode, Phase 5: the editor's File ▸ Perform hands the score over, unsaved edits included.

test('File ▸ Open in Performance Mode opens the edited score in performer mode and keeps it on the device', async ({
  page,
  context,
}) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const notesBefore = await page.locator('svg .Note').count();

  // An unsaved edit: a note made a rest
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await page.keyboard.press('Delete');
  await expect(page.locator('svg .Note')).toHaveCount(notesBefore - 1, { timeout: 20_000 });

  const opening = context.waitForEvent('page');
  await openMenuPath(page, ['File', 'Open in Performance Mode']);
  const perform = await opening;
  await expect(perform).toHaveURL(/\/perform\?score=local%3A/, { timeout: 30_000 });
  const performed = perform.getByTestId('performer-page-svg').locator('svg .Note');
  await expect(performed.first()).toBeAttached({ timeout: 60_000 });
  await expect(performed).toHaveCount(notesBefore - 1);

  // Listed in the library, from where it opens again
  await perform.goto('/perform');
  const kept = perform.getByTestId('device-score');
  await expect(kept).toHaveCount(1, { timeout: 30_000 });
  await kept.getByRole('link').click();
  await expect(performed.first()).toBeAttached({ timeout: 60_000 });

  // And back: Open in Editor opens the device copy (the edit included) in the editor
  await perform.keyboard.press('Escape');
  const editing = context.waitForEvent('page');
  await perform.getByTestId('performer-open-editor').click();
  const editor = await editing;
  await expect(editor).toHaveURL(/\/\?score=local%3A/, { timeout: 30_000 });
  await expect(editor.locator('svg .Note')).toHaveCount(notesBefore - 1, { timeout: 60_000 });
});

test('the editor has Open in Performance Mode on its toolbar', async ({ page }) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect(page.getByTestId('btn-perform')).toBeAttached();
  await expect(page.getByTestId('btn-perform')).toHaveAccessibleName(/Open in Performance Mode/);
});

test("the editor's left bar opens the score in performance mode", async ({ page, context }) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const launcher = page.getByTestId('launcher-perform');
  await expect(launcher).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('editor-perform-icons.png') });
  const opening = context.waitForEvent('page');
  await launcher.click();
  const perform = await opening;
  await expect(perform).toHaveURL(/\/perform\?score=local%3A/, { timeout: 30_000 });
  await expect(perform.getByTestId('performer-page-svg').locator('svg .Note').first()).toBeAttached(
    {
      timeout: 60_000,
    },
  );
});
