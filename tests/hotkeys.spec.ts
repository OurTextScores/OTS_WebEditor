import { expect, test } from 'playwright/test';

type HotkeyScoreWindow = typeof window & {
  __webmscore?: {
    saveMsc?: (format: 'mscx') => Promise<Uint8Array>;
    saveXml?: () => Promise<string>;
  };
};

test('hotkeys drive delete, undo/redo, and copy/paste', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readMscx = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as HotkeyScoreWindow).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const data = await score.saveMsc('mscx');
      return new TextDecoder().decode(data);
    });
  };

  const readXml = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as HotkeyScoreWindow).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      return score.saveXml();
    });
  };

  const countNotes = (xml: string) => (xml.match(/<Note>/g) || []).length;
  const initial = countNotes(await readMscx());

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await page.keyboard.press('Delete');
  await expect
    .poll(async () => countNotes(await readMscx()), { timeout: 20_000 })
    .toBe(initial - 1);

  await page.keyboard.press('Control+Z');
  await expect.poll(async () => countNotes(await readMscx()), { timeout: 20_000 }).toBe(initial);

  await page.keyboard.press('Control+Y');
  await expect
    .poll(async () => countNotes(await readMscx()), { timeout: 20_000 })
    .toBe(initial - 1);

  await page.keyboard.press('Control+Z');
  await expect.poll(async () => countNotes(await readMscx()), { timeout: 20_000 }).toBe(initial);

  await page.keyboard.press('Meta+Shift+Z');
  await expect
    .poll(async () => countNotes(await readMscx()), { timeout: 20_000 })
    .toBe(initial - 1);

  await page.keyboard.press('Control+Z');
  await expect.poll(async () => countNotes(await readMscx()), { timeout: 20_000 }).toBe(initial);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await page.keyboard.press('Control+C');

  await page.locator('svg .Note').nth(1).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  const xmlBeforePaste = await readXml();
  await page.keyboard.press('Control+V');
  await expect.poll(async () => await readXml(), { timeout: 20_000 }).not.toBe(xmlBeforePaste);
});

test('multi-selection copy/paste with shift-click', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readXml = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as HotkeyScoreWindow).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      return score.saveXml();
    });
  };

  // Native highlighting re-renders the SVG and can change DOM order, so `.nth()` is
  // not a stable musical identity. Resolve C, D, and E by their current x positions
  // before each click (also avoiding coordinates captured mid zoom transition).
  const notes = page.locator('svg .Note');
  const currentNoteIndices = async () =>
    notes.evaluateAll((nodes) =>
      nodes
        .map((node, index) => {
          const rect = node.getBoundingClientRect();
          return { index, x: rect.left + rect.width / 2 };
        })
        .sort((a, b) => a.x - b.x)
        .map(({ index }) => index),
    );

  // Select first note
  let noteIndices = await currentNoteIndices();
  expect(noteIndices).toHaveLength(3);
  await notes.nth(noteIndices[0]).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  // Shift-click second note to create range selection
  noteIndices = await currentNoteIndices();
  await notes.nth(noteIndices[1]).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(500);

  // Copy the range selection
  await page.keyboard.press('Control+C');
  await page.waitForTimeout(300);

  // Click on third note to set paste destination
  noteIndices = await currentNoteIndices();
  await notes.nth(noteIndices[2]).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  const xmlBeforePaste = await readXml();

  // Paste
  await page.keyboard.press('Control+V');
  await expect.poll(async () => await readXml(), { timeout: 20_000 }).not.toBe(xmlBeforePaste);
});
