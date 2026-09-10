import { expect, test } from 'playwright/test';

test('arrow hotkeys change pitch and octave', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readPitch = async (): Promise<{
    step: string | null;
    alter: number;
    octave: number | null;
  }> => {
    return page.evaluate(async () => {
      const score = (
        window as unknown as {
          __webmscore?: { saveXml?: () => Promise<string> };
        }
      ).__webmscore;
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
  await expect.poll(async () => (await readPitch()).alter, { timeout: 20_000 }).toBe(0);
  await expect.poll(async () => (await readPitch()).octave, { timeout: 20_000 }).toBe(4);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await readPitch()).alter, { timeout: 20_000 }).toBe(1);
  await expect.poll(async () => (await readPitch()).octave, { timeout: 20_000 }).toBe(4);

  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await readPitch()).alter, { timeout: 20_000 }).toBe(0);

  await page.keyboard.press('Control+ArrowUp');
  await expect.poll(async () => (await readPitch()).octave, { timeout: 20_000 }).toBe(5);

  await page.keyboard.press('Control+ArrowDown');
  await expect.poll(async () => (await readPitch()).octave, { timeout: 20_000 }).toBe(4);
});

test('left and right keep navigating after a pitch change', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readPitches = async () =>
    page.evaluate(async () => {
      const score = (
        window as unknown as {
          __webmscore?: { saveXml?: () => Promise<string> };
        }
      ).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      const xml: string = await score.saveXml();
      const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
      return Array.from(documentXml.querySelectorAll('note > pitch')).map((pitch) => ({
        step: pitch.querySelector('step')?.textContent ?? null,
        alter: Number(pitch.querySelector('alter')?.textContent ?? 0),
      }));
    });

  await page.locator('svg .Note').first().click();
  const overlay = page.getByTestId('selection-overlay');
  await expect(overlay).toBeVisible();
  const firstBox = await overlay.boundingBox();
  if (!firstBox) {
    throw new Error('Could not measure the first selected note.');
  }

  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await overlay.boundingBox())?.x ?? 0, {
      timeout: 20_000,
    })
    .toBeGreaterThan(firstBox.x);
  const secondBox = await overlay.boundingBox();
  if (!secondBox) {
    throw new Error('Could not measure the second selected note.');
  }

  await page.keyboard.press('ArrowUp');
  await expect
    .poll(async () => (await readPitches())[1]?.alter, {
      timeout: 20_000,
    })
    .toBe(1);

  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await overlay.boundingBox())?.x ?? 0, {
      timeout: 20_000,
    })
    .toBeGreaterThan(secondBox.x);
  const thirdBox = await overlay.boundingBox();
  if (!thirdBox) {
    throw new Error('Could not measure the third selected note.');
  }

  await page.keyboard.press('ArrowUp');
  await expect
    .poll(async () => (await readPitches())[2]?.step, {
      timeout: 20_000,
    })
    .toBe('F');

  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await overlay.boundingBox())?.x ?? Number.POSITIVE_INFINITY, {
      timeout: 20_000,
    })
    .toBeLessThan(thirdBox.x);

  await page.keyboard.press('ArrowDown');
  await expect
    .poll(async () => (await readPitches())[1]?.alter, {
      timeout: 20_000,
    })
    .toBe(0);
});
