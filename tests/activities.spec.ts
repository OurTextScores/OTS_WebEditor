import { expect, test } from 'playwright/test';
import { runCommand } from './helpers/commands';

const SCORE = '/?score=/test_scores/three_notes_cde.musicxml';

test.describe('activities', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SCORE);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
  });

  test('the activity bar switches between Write and History', async ({ page }) => {
    const write = page.getByTestId('activity-write');
    const history = page.getByTestId('activity-history');
    await expect(write).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('checkpoint-sidebar')).toHaveCount(0);

    await history.click();
    await expect(history).toHaveAttribute('aria-pressed', 'true');
    await expect(write).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('checkpoint-sidebar')).toBeVisible();
    await expect(page.locator('svg .Note').first()).toBeVisible();

    await write.click();
    await expect(page.getByTestId('checkpoint-sidebar')).toHaveCount(0);
    await expect(page.getByTestId('left-dock')).toBeVisible();
  });

  test('the AI Tools and Score source buttons open and close their panels, and show when each is open', async ({
    page,
  }) => {
    const ai = page.getByTestId('panel-ai-tools');
    const source = page.getByTestId('panel-score-source');
    await expect(ai).toHaveAttribute('aria-pressed', 'false');
    await expect(source).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('xml-sidebar')).toHaveCount(0);

    await ai.click();
    await expect(page.getByTestId('xml-sidebar')).toBeVisible();
    await expect(ai).toHaveAttribute('aria-pressed', 'true');
    await expect(source).toHaveAttribute('aria-pressed', 'false');

    await source.click();
    await expect(page.getByTestId('musicxml-sidebar')).toBeVisible();
    await expect(source).toHaveAttribute('aria-pressed', 'true');
    // Independent of the activity: Write is still the pressed activity.
    await expect(page.getByTestId('activity-write')).toHaveAttribute('aria-pressed', 'true');

    await ai.click();
    await expect(page.getByTestId('xml-sidebar')).toHaveCount(0);
    await expect(ai).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('musicxml-sidebar')).toBeVisible();
  });

  test('closing a panel with its own X un-presses its button', async ({ page }) => {
    await page.getByTestId('panel-ai-tools').click();
    await page.getByTestId('panel-score-source').click();
    await expect(page.getByTestId('panel-ai-tools')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('panel-score-source')).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Close AI Tools' }).click();
    await expect(page.getByTestId('xml-sidebar')).toHaveCount(0);
    await expect(page.getByTestId('panel-ai-tools')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('panel-score-source')).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Close Score Source' }).click();
    await expect(page.getByTestId('musicxml-sidebar')).toHaveCount(0);
    await expect(page.getByTestId('panel-score-source')).toHaveAttribute('aria-pressed', 'false');
  });

  test('History is read-only: a click selects but editing is off', async ({ page }) => {
    await runCommand(page, 'shell.activity.history');
    await page.locator('svg .Note').first().click();
    await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
    const result = await page.evaluate(() =>
      (
        window as unknown as {
          __otsCommands: { run(id: string): Promise<'ran' | 'disabled'> };
        }
      ).__otsCommands.run('edit.pitch.up'),
    );
    expect(result).toBe('disabled');
  });

  test('the arrow keys move along the activity bar', async ({ page }) => {
    await page.getByTestId('activity-write').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('activity-compare')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('activity-write')).toBeFocused();
  });

  test('the status bar checkpoint indicator opens History', async ({ page }) => {
    await page.getByTestId('status-checkpoint').click();
    await expect(page.getByTestId('activity-history')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Compare lights up while a session is open and closing returns to the activity', async ({
    page,
  }) => {
    await runCommand(page, 'shell.activity.history');
    await page.getByTestId('input-checkpoint-label').fill('Activities');
    await page.getByTestId('btn-checkpoint-save').click();
    await page.locator('[data-testid^="btn-checkpoint-compare-"]').last().click();
    await page.getByTestId('checkpoint-compare-modal').waitFor({ timeout: 20_000 });

    await expect(page.getByTestId('activity-compare')).toHaveAttribute('aria-pressed', 'true');
    // Compare sits between the header and the status bar, not over them.
    await expect(page.getByTestId('activity-bar')).toBeVisible();
    await expect(page.getByTestId('status-bar')).toBeVisible();

    await runCommand(page, 'shell.activity.history');
    await expect(page.getByTestId('checkpoint-compare-modal')).toHaveCount(0);
    await expect(page.getByTestId('activity-history')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the chosen activity is remembered', async ({ page }) => {
    await page.getByTestId('activity-history').click();
    await page.reload();
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await expect(page.getByTestId('activity-history')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('activity-write').click();
  });
});
