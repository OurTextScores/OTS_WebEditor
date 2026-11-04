import { expect, test, type Page } from 'playwright/test';
import { runCommand } from './helpers/commands';

// Roadmap E23: a checkpoint keeps the score natively (MSCZ) as well as in MusicXML, and a restore loads the MSCZ, so
// what MusicXML cannot hold (here, Style settings) comes back with it.
type StyleScore = {
  getStyleValues?: (keys: string[]) => Promise<Record<string, unknown>>;
  setStyleValues?: (values: Record<string, unknown>) => Promise<boolean>;
};
const STYLE = { staffDistance: 9, measureNumberSystem: false, measureNumberInterval: 2 };

const styleValues = (page: Page) =>
  page.evaluate(async (keys) => {
    const score = (window as typeof window & { __webmscore?: StyleScore }).__webmscore;
    // null while a restore swaps the score for a new one
    try {
      return (await score?.getStyleValues?.(keys)) ?? null;
    } catch {
      return null;
    }
  }, Object.keys(STYLE));
const setStyle = (page: Page, values: Record<string, unknown>) =>
  page.evaluate(async (v) => {
    const score = (window as typeof window & { __webmscore?: StyleScore }).__webmscore;
    return score?.setStyleValues?.(v);
  }, values);

test('restoring a checkpoint brings back its Style settings', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await setStyle(page, STYLE);

  await runCommand(page, 'shell.activity.history');
  await page.getByTestId('input-checkpoint-label').fill('Styled');
  await page.getByTestId('btn-checkpoint-save').click();
  const restore = page.locator('[data-testid^="btn-checkpoint-restore-"]').first();
  await expect(restore).toBeVisible();

  await setStyle(page, { staffDistance: 6.5, measureNumberSystem: true, measureNumberInterval: 5 });
  expect(await styleValues(page)).not.toEqual(STYLE);

  await restore.click();
  await page.getByTestId('dialog-confirm').click();
  await expect.poll(() => styleValues(page), { timeout: 30_000 }).toEqual(STYLE);
  await expect(page.locator('svg .Note').first()).toBeVisible();
});
