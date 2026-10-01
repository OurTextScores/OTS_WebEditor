import { expect, test } from '@playwright/test';
import { runCommand } from './helpers/commands';

test('loads two local score files into the compare workspace', async ({ page }) => {
  await page.goto('/');

  // File ▸ Compare Scores: the ribbon button moved into the menu under the v2 shell.
  await runCommand(page, 'compare.load');
  const loader = page.getByTestId('compare-score-loader-modal');
  await expect(loader).toBeVisible();
  await expect(loader.getByRole('button', { name: 'Compare' })).toBeDisabled();

  await page
    .getByTestId('compare-left-score-input')
    .setInputFiles('public/test_scores/two_staves_four_bars.musicxml');
  await page
    .getByTestId('compare-right-score-input')
    .setInputFiles('public/test_scores/two_staves_four_bars_inserted.musicxml');

  await expect(loader).toContainText('two_staves_four_bars.musicxml');
  await expect(loader).toContainText('two_staves_four_bars_inserted.musicxml');
  await loader.getByRole('button', { name: 'Compare' }).click();

  const compareWorkspace = page.getByTestId('checkpoint-compare-modal');
  await expect(compareWorkspace).toBeVisible({ timeout: 60_000 });
  await expect(compareWorkspace).toContainText(
    'two_staves_four_bars.musicxml vs two_staves_four_bars_inserted.musicxml',
  );
  await expect(page.getByTestId('compare-pane-left').locator('svg')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('compare-pane-right').locator('svg')).toBeVisible({
    timeout: 60_000,
  });
});
