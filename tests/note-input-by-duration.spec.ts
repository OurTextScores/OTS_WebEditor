import { expect, test, type Page } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand } from './helpers/commands';

/**
 * Input by duration (MuseScore 4.5, roadmap E11): in note input, a letter sets the pitch without entering it, and
 * each duration key then enters a note of that pitch and duration.
 */

const readPitches = async (page: Page): Promise<string[]> =>
  Array.from(
    (await page.evaluate(async () => (window as BrowserScoreWindow).__webmscore!.saveXml!())).matchAll(
      /<pitch>\s*<step>([A-G])<\/step>\s*<octave>(\d+)<\/octave>\s*<\/pitch>/g,
    ),
  ).map((m) => `${m[1]}${m[2]}`);

test('a letter sets the pitch, a duration key enters it', async ({ page }) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect.poll(() => readPitches(page), { timeout: 20_000 }).toEqual(['F4', 'A4', 'C5', 'E5']);

  const box = await page.locator('svg .Note').first().boundingBox();
  if (!box) throw new Error('no note');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await runCommand(page, 'add.noteInput');
  await expect(page.locator('button', { hasText: 'Stop input' })).toBeVisible();
  await runCommand(page, 'add.inputMethod', 7);

  await page.keyboard.press('e');
  // Nothing is entered yet: the letter only chose the pitch.
  await page.waitForTimeout(500);
  expect(await readPitches(page)).toEqual(['F4', 'A4', 'C5', 'E5']);

  await page.keyboard.press('5'); // quarter
  await expect.poll(async () => (await readPitches(page)).filter((p) => p.startsWith('E')).length).toBe(2);
  await page.keyboard.press('5');
  await expect.poll(async () => (await readPitches(page)).filter((p) => p.startsWith('E')).length).toBe(3);
});
