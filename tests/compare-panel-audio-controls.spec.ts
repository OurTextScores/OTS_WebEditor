import { expect, test } from '@playwright/test';
import { runCommand } from './helpers/commands';

// Each compare panel shows a different Score instance (one live, one
// checkpoint) with its own independent play/pause/stop transport. Starting
// playback on one panel must stop the other so only one voice plays at once.
test('compare panels have independent play/pause/stop with mutual exclusion', async ({ page }) => {
  page.on('dialog', (dialog) => {
    void dialog.dismiss();
  });

  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const checkpointLabel = 'Audio Controls Test';
  // The checkpoint list lives in the History activity.
  await runCommand(page, 'shell.activity.history');
  await page.getByTestId('input-checkpoint-label').fill(checkpointLabel);
  await page.getByTestId('btn-checkpoint-save').click();

  const compareCheckpoint = page.locator('[data-testid^="btn-checkpoint-compare-"]').last();
  await expect(compareCheckpoint).toBeVisible({ timeout: 15_000 });
  await compareCheckpoint.click();
  await page.getByTestId('checkpoint-compare-modal').waitFor({ timeout: 20_000 });

  const playLeft = page.getByTestId('btn-compare-play-left');
  const stopLeft = page.getByTestId('btn-compare-stop-left');
  const playRight = page.getByTestId('btn-compare-play-right');
  const stopRight = page.getByTestId('btn-compare-stop-right');

  await expect(playLeft).toBeVisible();
  await expect(playRight).toBeVisible();
  await expect(stopLeft).toBeDisabled();
  await expect(stopRight).toBeDisabled();

  // Play left: left starts, stop-left becomes enabled, right stays idle.
  await playLeft.click();
  await expect(playLeft).toHaveAttribute('title', /Pause/, { timeout: 10_000 });
  await expect(stopLeft).toBeEnabled();
  await expect(stopRight).toBeDisabled();

  // Play right while left is playing: right takes over, left is stopped (mutual exclusion).
  await playRight.click();
  await expect(playRight).toHaveAttribute('title', /Pause/, { timeout: 10_000 });
  await expect(stopRight).toBeEnabled();
  await expect(playLeft).toHaveAttribute('title', 'Play');
  await expect(stopLeft).toBeDisabled();

  // Stop right: reverts to Play and disables Stop.
  await stopRight.click();
  await expect(playRight).toHaveAttribute('title', 'Play');
  await expect(stopRight).toBeDisabled();
});
