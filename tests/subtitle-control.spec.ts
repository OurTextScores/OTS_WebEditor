import { expect, test } from 'playwright/test';

test('subtitle control is populated from metadata', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const subtitleInput = page.getByTestId('input-subtitle');
  await expect(subtitleInput).toBeVisible();

  const subtitleValue = await subtitleInput.inputValue();
  expect(subtitleValue).toContain('Bach: Cello Suite');

  await expect(page.getByTestId('btn-set-subtitle')).toBeVisible();
});
