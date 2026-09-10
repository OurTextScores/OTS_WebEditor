import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';

test('drag selection marquee selects multiple notes for transpose', async ({ page }) => {
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
  await notes.nth(0).scrollIntoViewIfNeeded();
  const first = await notes.nth(0).boundingBox();
  const last = await notes.nth(2).boundingBox();
  const wrapper = await page.getByTestId('score-wrapper').boundingBox();
  expect(first).not.toBeNull();
  expect(last).not.toBeNull();
  expect(wrapper).not.toBeNull();
  if (!first || !last || !wrapper) return;

  const padding = 20;
  const startX = Math.max(wrapper.x + 1, first.x + first.width / 2 - padding);
  const startY = Math.max(wrapper.y + 1, first.y + first.height / 2 - padding);
  const endX = Math.min(wrapper.x + wrapper.width - 1, last.x + last.width / 2 + padding);
  const endY = Math.min(wrapper.y + wrapper.height - 1, last.y + last.height / 2 + padding);

  // Ctrl explicitly selects the lasso gesture even if the start point overlaps a
  // draggable note/stem after an engraving or viewport change.
  await page.keyboard.down('Control');
  try {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.getByTestId('drag-selection-rect').waitFor({ timeout: 10_000 });
    await page.mouse.up();
  } finally {
    await page.keyboard.up('Control');
  }

  // A lasso is represented by one overlay per selected element.
  await page.getByTestId('selection-overlay-0').waitFor({ timeout: 10_000 });
  await page.getByTestId('btn-transpose-12').click();

  await expect
    .poll(async () => await readPitches(), { timeout: 20_000 })
    .toEqual(['C5', 'D5', 'E5']);
});
