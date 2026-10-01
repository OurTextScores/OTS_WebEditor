import { expect, test } from '@playwright/test';
import { runCommand } from './helpers/commands';

/**
 * Real-WASM coverage for closing the compare workspace while a pane is actively
 * streaming. No other browser case does this: compare-panel-audio-controls always stops
 * playback before it finishes, so this lifecycle path had no browser coverage at all.
 *
 * It starts playback and waits for the transport to be genuinely live -- title="Pause"
 * only appears after setIsPlaying(true), which runs inside playSynthBatchStream, so a real
 * batch iterator exists -- then closes compare without stopping first and asserts the
 * editor survives: it still renders, still selects, and compare can be reopened.
 *
 * Scope, stated honestly: this does NOT discriminate the b95fde76 teardown fix. It was
 * checked against a reverted build and still passed, so destroying a score while its
 * iterator cancel is orphaned does not surface as a worker fault here. The invariant that
 * destroy() waits for the tracked cancel is pinned by the unit case
 * "drains a tracked cancellation before the coordinator destroys the score" in
 * unit/compare-transport.test.tsx, which does fail without the fix. What this case buys is
 * proof that the real engine path works end to end, and it would catch a user-visible
 * breakage -- a dead editor or an unopenable compare after close-during-playback.
 */
test('closing compare while a pane is streaming tears down without a worker error', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('dialog', (dialog) => {
    void dialog.dismiss();
  });

  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const checkpointLabel = 'Close During Playback';
  // The checkpoint list lives in the History activity.
  await runCommand(page, 'shell.activity.history');
  await page.getByTestId('input-checkpoint-label').fill(checkpointLabel);
  await page.getByTestId('btn-checkpoint-save').click();

  const compareCheckpoint = page.locator('[data-testid^="btn-checkpoint-compare-"]').last();
  await expect(compareCheckpoint).toBeVisible({ timeout: 15_000 });
  await compareCheckpoint.click();
  await page.getByTestId('checkpoint-compare-modal').waitFor({ timeout: 20_000 });

  // Start playback on the right pane and wait until it is genuinely streaming rather
  // than still loading the soundfont; otherwise no iterator exists to race the teardown.
  const playRight = page.getByTestId('btn-compare-play-right');
  await playRight.click();
  await expect(playRight).toHaveAttribute('title', /Pause/, { timeout: 30_000 });

  // Close without stopping first. This is the path that used to destroy the auxiliary
  // score while its iterator cancel was still in flight.
  await page.getByRole('button', { name: /^(Close|Done - Close)$/ }).click();
  await expect(page.getByTestId('checkpoint-compare-modal')).toBeHidden({ timeout: 20_000 });

  // The editor underneath must still be alive and interactive after the teardown.
  await expect(page.locator('svg .Note').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('svg .Note').first().click();
  await expect(page.getByTestId('selection-overlay')).toBeVisible({ timeout: 20_000 });

  // Re-opening compare must still work, which requires a clean auxiliary score lifecycle.
  await compareCheckpoint.click();
  await page.getByTestId('checkpoint-compare-modal').waitFor({ timeout: 20_000 });
  await expect(page.getByTestId('btn-compare-play-right')).toBeVisible();

  // Only genuine WASM faults count. React StrictMode's double-invoke produces a benign
  // "AbortError: signal is aborted without reason" from the auto-load effect cleanup on
  // every dev run, so it is excluded explicitly rather than by loosening the patterns.
  const fatal = [...pageErrors, ...consoleErrors].filter(
    (message) =>
      /table index is out of bounds|memory access out of bounds|unreachable executed|RuntimeError/i.test(
        message,
      ) && !/AbortError/i.test(message),
  );
  expect(fatal, `worker/WASM errors during teardown:\n${fatal.join('\n')}`).toEqual([]);
});
