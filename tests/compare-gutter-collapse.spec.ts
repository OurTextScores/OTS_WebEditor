import { expect, test } from './helpers/diagnostic-test';
import { runCommand } from './helpers/commands';

test('the compare gutter collapses to a strip and comes back', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'compare.load');
  const loader = page.getByTestId('compare-score-loader-modal');
  await page
    .getByTestId('compare-left-score-input')
    .setInputFiles('public/test_scores/two_staves_four_bars.musicxml');
  await page
    .getByTestId('compare-right-score-input')
    .setInputFiles('public/test_scores/two_staves_four_bars_inserted.musicxml');
  await loader.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByTestId('compare-pane-left').locator('svg')).toBeVisible({
    timeout: 60_000,
  });

  const gutter = page.getByTestId('compare-gutter');
  const toggle = page.getByTestId('compare-gutter-toggle');
  const scrollRegion = gutter.getByTestId('compare-gutter-scroll');
  await expect(gutter).toHaveAttribute('data-collapsed', 'false');
  await expect(toggle).toHaveAccessibleName('Hide comparison gutter');
  const expandedWidth = (await gutter.boundingBox())!.width;
  const paneWidth = (await page.getByTestId('compare-pane-left').boundingBox())!.width;

  await toggle.click();
  await expect(gutter).toHaveAttribute('data-collapsed', 'true');
  await expect(toggle).toHaveAccessibleName('Show comparison gutter');
  await expect(scrollRegion).toBeHidden();
  const collapsedWidth = (await gutter.boundingBox())!.width;
  expect(collapsedWidth).toBeLessThan(40);
  expect(collapsedWidth).toBeLessThan(expandedWidth);
  // The panes take the room the gutter gave up.
  await expect
    .poll(async () => (await page.getByTestId('compare-pane-left').boundingBox())!.width)
    .toBeGreaterThan(paneWidth);

  // The choice is remembered for the next comparison.
  expect(await page.evaluate(() => localStorage.getItem('ots.compare.gutterCollapsed'))).toBe('1');

  // The strip's own button brings it back.
  await gutter.getByTestId('compare-gutter-expand').click();
  await expect(gutter).toHaveAttribute('data-collapsed', 'false');
  await expect(gutter.getByTestId('compare-gutter-expand')).toHaveCount(0);
  await expect(scrollRegion).toBeVisible();
});
