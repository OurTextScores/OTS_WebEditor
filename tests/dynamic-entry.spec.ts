import { expect, test } from './helpers/diagnostic-test';
import { runCommand } from './helpers/commands';

// Add ▸ Marks ▸ Dynamic… (roadmap E11, after desktop MuseScore's add-dynamic): a popup at the selected note where the
// dynamic is typed (Enter adds it) or picked; one undoable edit.

test('typing a dynamic in the popup adds it to the selected note, and undo takes it away', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  const notes = page.locator('[data-testid="svg-container"] svg .Note');
  await notes.first().waitFor({ timeout: 60_000 });
  const dynamics = page.locator('[data-testid="svg-container"] svg .Dynamic');
  await expect(dynamics).toHaveCount(0);

  await notes.first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 30_000 });
  await runCommand(page, 'add.mark.dynamicEntry');
  const input = page.getByTestId('dynamic-entry-input');
  await expect(input).toBeFocused();
  await input.fill('mf');
  await expect(page.getByTestId('dynamic-entry-mf')).toBeVisible();
  await input.press('Enter');
  await expect(page.getByTestId('dynamic-entry')).toHaveCount(0);
  await expect(dynamics).toHaveCount(1);
  await expect(dynamics.first()).toHaveAttribute('data-text', /\S/);

  await runCommand(page, 'edit.undo');
  await expect(dynamics).toHaveCount(0);

  // Picked from the list instead, on the second bar's note; Escape on another opening closes without adding
  await notes.nth(1).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 30_000 });
  await runCommand(page, 'add.mark.dynamicEntry');
  await page.getByTestId('dynamic-entry-input').fill('sf');
  await page.getByTestId('dynamic-entry-sfz').click();
  await expect(dynamics).toHaveCount(1);
  await runCommand(page, 'add.mark.dynamicEntry');
  await page.getByTestId('dynamic-entry-input').press('Escape');
  await expect(page.getByTestId('dynamic-entry')).toHaveCount(0);
  await expect(dynamics).toHaveCount(1);
});
