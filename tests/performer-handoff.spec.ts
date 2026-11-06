import { expect, test } from './helpers/diagnostic-test';
import { openMenuPath } from './helpers/commands';

// Performer mode, Phase 5: the editor's File ▸ Perform hands the score over, unsaved edits included.

test('File ▸ Perform opens the edited score in performer mode and keeps it on the device', async ({
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
  await openMenuPath(page, ['File', 'Perform']);
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
});
