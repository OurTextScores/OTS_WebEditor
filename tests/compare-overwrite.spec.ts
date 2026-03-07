import { expect, test } from '@playwright/test';

test('compare overwrite applies left measure to right', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const checkpointLabel = 'Overwrite Test';
  await page.getByTestId('input-checkpoint-label').fill(checkpointLabel);
  await page.getByTestId('btn-checkpoint-save').click();

  const checkpointCard = page.locator('div').filter({ hasText: checkpointLabel }).first();
  await expect(checkpointCard).toBeVisible({ timeout: 15_000 });

  const firstNote = page.locator('svg .Note').first();
  await firstNote.click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await page.getByTestId('btn-pitch-up').click();

  await checkpointCard.getByRole('button', { name: 'Compare' }).click();
  await page.getByTestId('checkpoint-compare-modal').waitFor({ timeout: 20_000 });

  await expect.poll(async () => {
    return page.getByTestId('compare-right-highlight').count();
  }, { timeout: 20_000 }).toBeGreaterThan(0);

  const overwriteRight = page.getByRole('button', { name: /Overwrite right/i }).first();
  await expect(overwriteRight).toBeEnabled({ timeout: 10_000 });
  await overwriteRight.click();

  await expect.poll(async () => {
    const rightCount = await page.getByTestId('compare-right-highlight').count();
    const leftCount = await page.getByTestId('compare-left-highlight').count();
    return { rightCount, leftCount };
  }, { timeout: 20_000 }).toEqual({ rightCount: 0, leftCount: 0 });
});
