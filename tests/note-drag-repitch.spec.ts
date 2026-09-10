import { expect, test, type Page } from 'playwright/test';

// At small fit-zoom a staff space shrinks below the 4px drag threshold; use a large
// viewport so the drag gesture distances are comfortably above it.
test.use({ viewport: { width: 2400, height: 1600 } });

type Pitch = { step: string | null; alter: number; octave: number | null };

const readPitch = async (page: Page): Promise<Pitch> => {
  return page.evaluate(async () => {
    const scoreWindow = window as unknown as { __webmscore?: { saveXml?: () => Promise<string> } };
    const score = scoreWindow.__webmscore;
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

const prepareSingleNoteScore = async (page: Page) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  await expect.poll(async () => (await readPitch(page)).step, { timeout: 20_000 }).toBe('C');
  await expect.poll(async () => (await readPitch(page)).octave, { timeout: 20_000 }).toBe(4);

  // Click the note first so the editor is fully interaction-ready before the gesture.
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  const noteBox = await page.locator('svg .Note').first().boundingBox();
  if (!noteBox) {
    throw new Error('Could not measure note geometry');
  }

  return {
    // The notehead is one staff space tall, so half of it is one diatonic step.
    halfStep: noteBox.height / 2,
    cx: noteBox.x + noteBox.width / 2,
    cy: noteBox.y + noteBox.height / 2,
  };
};

test('dragging a note vertically repitches it diatonically', async ({ page }) => {
  const { halfStep, cx, cy } = await prepareSingleNoteScore(page);
  const initialBox = await page.locator('svg .Note').first().boundingBox();
  if (!initialBox) throw new Error('Could not measure initial note geometry');

  // Drag up two diatonic steps: C4 -> E4.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 2 * halfStep, { steps: 8 });
  await expect(page.getByTestId('note-drag-ghost')).toBeVisible();
  // v2 live drag: the engine-rendered note moves before pointer-up, rather than
  // leaving all visual feedback to the JS ghost overlay.
  await expect
    .poll(
      async () => {
        const liveBox = await page.locator('svg .Note').first().boundingBox();
        return liveBox?.y ?? initialBox.y;
      },
      { timeout: 20_000 },
    )
    .toBeLessThan(initialBox.y - halfStep);
  await page.mouse.up();

  await expect.poll(async () => (await readPitch(page)).step, { timeout: 20_000 }).toBe('E');
  await expect.poll(async () => (await readPitch(page)).octave, { timeout: 20_000 }).toBe(4);

  // The whole gesture must be one undoable command.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await readPitch(page)).step, { timeout: 20_000 }).toBe('C');
  await expect.poll(async () => (await readPitch(page)).octave, { timeout: 20_000 }).toBe(4);
});

test('dragging a note down repitches it downward', async ({ page }) => {
  const { halfStep, cx, cy } = await prepareSingleNoteScore(page);

  // Drag down one diatonic step: C4 -> B3.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + halfStep, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await readPitch(page)).step, { timeout: 20_000 }).toBe('B');
  await expect.poll(async () => (await readPitch(page)).octave, { timeout: 20_000 }).toBe(3);
});

test('Escape cancels a note drag without changing the pitch', async ({ page }) => {
  const { halfStep, cx, cy } = await prepareSingleNoteScore(page);

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 2 * halfStep, { steps: 8 });
  await expect(page.getByTestId('note-drag-ghost')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('note-drag-ghost')).toBeHidden();
  await page.mouse.up();

  // Give any (unexpected) commit time to land, then confirm the pitch is untouched.
  await page.waitForTimeout(1_000);
  await expect.poll(async () => (await readPitch(page)).step, { timeout: 20_000 }).toBe('C');
  await expect.poll(async () => (await readPitch(page)).octave, { timeout: 20_000 }).toBe(4);
});
