import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';

test('cmd/ctrl click extends selection for transpose', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readPitches = async (): Promise<string[]> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      const xml: string = await score.saveXml();
      const matches = Array.from(
        xml.matchAll(
          /<pitch>[\s\S]*?<step>([A-G])<\/step>[\s\S]*?(?:<alter>(-?\d+)<\/alter>[\s\S]*?)?<octave>(\d+)<\/octave>[\s\S]*?<\/pitch>/g,
        ),
      );
      return matches.map((m) => `${m[1]}${Number(m[2] ?? 0) || ''}${m[3]}`);
    });
  };

  await expect
    .poll(async () => await readPitches(), { timeout: 20_000 })
    .toEqual(['C4', 'D4', 'E4']);

  const notes = page.locator('svg .Note');
  await notes.nth(0).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  const rightmost = await notes.evaluateAll((elements) =>
    elements.reduce(
      (best, element) => {
        const rect = element.getBoundingClientRect();
        const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        return !best || point.x > best.x ? point : best;
      },
      null as { x: number; y: number } | null,
    ),
  );
  expect(rightmost).not.toBeNull();
  await page.keyboard.down('Control');
  await page.mouse.click(rightmost!.x, rightmost!.y);
  await page.keyboard.up('Control');
  await page.getByTestId('btn-transpose-12').click();

  await expect
    .poll(async () => await readPitches(), { timeout: 20_000 })
    .toEqual(['C5', 'D4', 'E5']);
});
