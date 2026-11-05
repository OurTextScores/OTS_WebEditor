import { expect, test, type Page } from './helpers/diagnostic-test';

// Selection within a chord and Repeat Selection from the keyboard (roadmap E11), as desktop MuseScore:
// Alt+Up/Down the note above/below in the chord, Ctrl+Alt+Up/Down its top/bottom note, R the selection again after
// itself. Notes are told apart by their height on the page (the engine's selection box).

type Box = { y: number } | null;
const selectedTop = (page: Page) =>
  page.evaluate(async () => {
    const score = (
      window as typeof window & { __webmscore?: { getSelectionBoundingBox?: () => Promise<Box> } }
    ).__webmscore;
    const box = await score?.getSelectionBoundingBox?.();
    return box ? Math.round(box.y) : null;
  });

test('Alt+Up/Down and Ctrl+Alt+Up/Down move the selection within a chord', async ({ page }) => {
  await page.goto('/?score=/test_scores/two_chords.musicxml'); // C4+E4, D4+F4
  const notes = page.locator('[data-testid="svg-container"] svg .Note');
  await notes.first().waitFor({ timeout: 60_000 });
  await notes.first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 30_000 });
  const first = await selectedTop(page);
  expect(first).not.toBeNull();

  await page.keyboard.press('ControlOrMeta+Alt+ArrowUp');
  await expect.poll(() => selectedTop(page)).not.toBe(first);
  const top = (await selectedTop(page))!;
  await page.keyboard.press('ControlOrMeta+Alt+ArrowDown');
  await expect.poll(() => selectedTop(page)).toBeGreaterThan(top);
  const bottom = (await selectedTop(page))!;
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => selectedTop(page)).toBe(top);
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => selectedTop(page)).toBe(bottom);
  // The overlay follows the engine's selection
  await expect(page.getByTestId('selection-overlay')).toBeVisible();
});

test('R repeats a range after itself, and undo takes it back', async ({ page }) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml'); // F4, A4, C5, E5
  const notes = page.locator('[data-testid="svg-container"] svg .Note');
  await notes.first().waitFor({ timeout: 60_000 });
  const bars = () =>
    page.evaluate(async () => {
      const score = (
        window as typeof window & { __webmscore?: { saveXml?: () => Promise<unknown> } }
      ).__webmscore;
      const saved = await score?.saveXml?.();
      const xml = typeof saved === 'string' ? saved : new TextDecoder().decode(saved as Uint8Array);
      return [...xml.matchAll(/<measure\b[\s\S]*?<\/measure>/g)].map((m) =>
        [...m[0].matchAll(/<step>(\w)<\/step>\s*<octave>(\d)<\/octave>/g)]
          .map((n) => n[1] + n[2])
          .join(' '),
      );
    });
  expect(await bars()).toEqual(['F4', 'A4', 'C5', 'E5']);
  // A range from bar 1's note (Ctrl+Shift+Right from a note reaches through bar 2)
  await notes.first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 30_000 });
  await page.keyboard.press('ControlOrMeta+Shift+ArrowRight');
  await page.keyboard.press('r');
  await expect.poll(bars).toEqual(['F4', 'A4', 'F4', 'A4']);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(bars).toEqual(['F4', 'A4', 'C5', 'E5']);
});
