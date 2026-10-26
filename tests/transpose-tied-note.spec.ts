import { expect, test, type Page } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';

// Changing a tied note's octave moves the whole tie chain, as Up/Down do (it used to move only the clicked note)
const pitches = (page: Page) =>
  page.evaluate(async () => {
    const xml: string = await (window as BrowserScoreWindow).__webmscore!.saveXml!();
    return [
      ...xml.matchAll(
        /<step>([A-G])<\/step>\s*(?:<alter>(-?\d)<\/alter>\s*)?<octave>(\d)<\/octave>/g,
      ),
    ]
      .map((m) => m[1] + (m[2] === '1' ? '#' : m[2] === '-1' ? 'b' : '') + m[3])
      .join(' ');
  });

test('octave up and down on one note of a tie move both tied notes', async ({ page }) => {
  await page.goto('/?score=/test_scores/tied_c4_half_notes.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect.poll(() => pitches(page), { timeout: 20_000 }).toBe('C4 C4');

  // A ledger line can paint over the notehead in Firefox; the canvas handles selection at this point.
  const note = await page.locator('svg .Note').first().boundingBox();
  if (!note) throw new Error('Tied note geometry is unavailable');
  await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await page.keyboard.press('Control+ArrowUp');
  await expect.poll(() => pitches(page), { timeout: 20_000 }).toBe('C5 C5');

  await page.keyboard.press('Control+ArrowDown');
  await expect.poll(() => pitches(page), { timeout: 20_000 }).toBe('C4 C4');

  // Up (a semitone) already moved the chain; it stays the reference
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => pitches(page), { timeout: 20_000 }).toBe('C#4 C#4');
});
