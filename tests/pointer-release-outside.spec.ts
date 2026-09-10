import { expect, test } from 'playwright/test';

/**
 * SECURITY_CORRECTNESS_FINDINGS L5: a drag-select released where the pointer cannot be
 * mapped back into score coordinates (outside the score container) ends the gesture
 * without re-deriving the selection overlay.
 *
 * The user-visible question is simply whether the editor still works afterwards, so that
 * is what this asserts: release outside, then click a note and expect a selection.
 */
test('stays responsive after a drag is released outside the score', async ({ page }) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.waitForTimeout(1_000);

  const firstNote = await page.locator('svg .Note').first().boundingBox();
  if (!firstNote) throw new Error('Expected a note to drag from.');

  // Drag from empty space near the staff and release well above the container, where
  // clientToScorePoint cannot produce a score coordinate.
  await page.mouse.move(firstNote.x - 40, firstNote.y + 10);
  await page.mouse.down();
  await page.mouse.move(firstNote.x + 60, firstNote.y + 10, { steps: 8 });
  await page.mouse.move(firstNote.x + 60, 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  // The marquee must not be left on screen.
  await expect(page.getByTestId('drag-selection-rect')).toHaveCount(0);

  // And the very next click has to select, not be swallowed by the gesture that ended
  // outside the score.
  await page.mouse.click(firstNote.x + firstNote.width / 2, firstNote.y + firstNote.height / 2);
  await expect(page.getByTestId('selection-overlay').first()).toBeVisible({ timeout: 15_000 });
});
