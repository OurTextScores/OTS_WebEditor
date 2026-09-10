import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';

test('transpose octave up/down updates exported pitch', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readPitch = async (): Promise<{
    step: string | null;
    alter: number;
    octave: number | null;
  }> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      const xml: string = await score.saveXml();
      const step = xml.match(/<step>([A-G])<\/step>/)?.[1] ?? null;
      const alter = Number(xml.match(/<alter>(-?\d+)<\/alter>/)?.[1] ?? 0);
      const octave = Number(xml.match(/<octave>(\d+)<\/octave>/)?.[1] ?? NaN);
      return { step, alter, octave: Number.isFinite(octave) ? octave : null };
    });
  };

  await expect.poll(async () => (await readPitch()).step, { timeout: 20_000 }).toBe('C');
  await expect.poll(async () => (await readPitch()).octave, { timeout: 20_000 }).toBe(4);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await page.getByTestId('btn-transpose-12').click();
  await expect.poll(async () => (await readPitch()).octave, { timeout: 20_000 }).toBe(5);

  await page.getByTestId('btn-transpose--12').click();
  await expect.poll(async () => (await readPitch()).octave, { timeout: 20_000 }).toBe(4);
});
