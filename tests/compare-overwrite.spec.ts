import { expect, test } from '@playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand } from './helpers/commands';

test('compare overwrite applies left measure to right', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const checkpointLabel = 'Overwrite Test';
  await page.getByTestId('input-checkpoint-label').fill(checkpointLabel);
  await page.getByTestId('btn-checkpoint-save').click();

  const checkpointCard = page.locator('div').filter({ hasText: checkpointLabel }).first();
  await expect(checkpointCard).toBeVisible({ timeout: 15_000 });

  // Full pitch signature, not just <step>: btn-pitch-up raises by a semitone, so C becomes
  // C sharp -- <step> stays "C" and only <alter> changes.
  const readFirstPitch = async (): Promise<string> =>
    page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      const xml: string = await score.saveXml();
      const pitch = xml.match(/<pitch>[\s\S]*?<\/pitch>/)?.[0] ?? '';
      const step = pitch.match(/<step>([A-G])<\/step>/)?.[1] ?? '';
      const alter = pitch.match(/<alter>(-?\d+)<\/alter>/)?.[1] ?? '0';
      const octave = pitch.match(/<octave>(\d+)<\/octave>/)?.[1] ?? '';
      return `${step}${alter}/${octave}`;
    });

  const pitchBeforeEdit = await readFirstPitch();

  const firstNote = page.locator('svg .Note').first();
  await firstNote.click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await runCommand(page, 'btn-pitch-up');

  // Wait for the mutation to reach the engine before opening compare. Without this the
  // workspace can snapshot currentXml while the pitch-up is still in flight, leaving the
  // two sides identical, so no diff highlights are ever produced and the poll below times
  // out. That was the flake: it reproduced under load and passed otherwise.
  await expect.poll(readFirstPitch, { timeout: 20_000 }).not.toBe(pitchBeforeEdit);

  // By test id: the outermost div that holds the label also holds the ribbon's "Load scores to
  // compare" button, which a role-and-name match on "Compare" finds as well.
  await page.locator('[data-testid^="btn-checkpoint-compare-"]').last().click();
  await page.getByTestId('checkpoint-compare-modal').waitFor({ timeout: 20_000 });

  await expect
    .poll(
      async () => {
        return page.getByTestId('compare-right-highlight').count();
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);

  const overwriteRight = page.getByRole('button', { name: /Overwrite right/i }).first();
  await expect(overwriteRight).toBeEnabled({ timeout: 10_000 });
  await overwriteRight.click();

  await expect
    .poll(
      async () => {
        const rightCount = await page.getByTestId('compare-right-highlight').count();
        const leftCount = await page.getByTestId('compare-left-highlight').count();
        return { rightCount, leftCount };
      },
      { timeout: 20_000 },
    )
    .toEqual({ rightCount: 0, leftCount: 0 });
});
