import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand, waitForCommandEnabled } from './helpers/commands';

/**
 * Regression: "Delete Selected Bars" was wired in dd15d189 and silently lost one day
 * later in the 014e6ebe select-measure merge -- ScoreEditor stopped passing
 * onRemoveContainingMeasures, so MeasuresSection's `!onRemoveContainingMeasures`
 * guard held the button disabled forever.
 *
 * The unit test for this button passes its own mock handler, so it stayed green
 * throughout. Only an end-to-end path that clicks the real button in the real editor
 * can catch a handler the app never supplies -- which is what this covers.
 */

const SCORE = '/?score=/test_scores/four_measures.musicxml';

/** Bar pitches of four_measures.musicxml, in order. */
const readPitches = async (page: import('playwright/test').Page): Promise<string[]> =>
  page.evaluate(async () => {
    const score = (window as BrowserScoreWindow).__webmscore;
    if (!score?.saveXml) throw new Error('window.__webmscore.saveXml is not available');
    const xml: string = await score.saveXml();
    return Array.from(
      xml.matchAll(/<pitch>\s*<step>([A-G])<\/step>\s*<octave>(\d+)<\/octave>\s*<\/pitch>/g),
    ).map((m) => `${m[1]}${m[2]}`);
  });

test('selecting a bar enables Delete Selected Bars and removes that bar', async ({ page }) => {
  await page.goto(SCORE);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  await expect
    .poll(async () => await readPitches(page), { timeout: 20_000 })
    .toEqual(['F4', 'A4', 'C5', 'E5']);

  // With nothing selected the action has nothing to act on.
  const isEnabled = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __otsCommands: { list(): { id: string; enabled: boolean }[] };
          }
        ).__otsCommands
          .list()
          .find((c) => c.id === 'tools.measures.removeSelected')?.enabled,
    );
  expect(await isEnabled()).toBe(false);

  // Click empty space inside bar 2 -- to the right of its note, before bar 3's note.
  const notes = page.locator('svg .Note');
  const bar2Note = await notes.nth(1).boundingBox();
  const bar3Note = await notes.nth(2).boundingBox();
  expect(bar2Note).not.toBeNull();
  expect(bar3Note).not.toBeNull();
  if (!bar2Note || !bar3Note) return;

  await page.mouse.click(
    (bar2Note.x + bar2Note.width + bar3Note.x) / 2,
    bar2Note.y + bar2Note.height / 2,
  );

  // Selecting a bar must make the action reachable. This is the assertion that
  // fails when the handler is not wired through.
  await waitForCommandEnabled(page, 'btn-remove-containing-measures', { timeout: 10_000 });

  await runCommand(page, 'btn-remove-containing-measures');

  // Bar 2 (A4) is gone; the others survive in order.
  await expect
    .poll(async () => await readPitches(page), { timeout: 20_000 })
    .toEqual(['F4', 'C5', 'E5']);
});
