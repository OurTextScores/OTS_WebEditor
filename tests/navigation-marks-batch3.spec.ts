import { expect, test, type Page } from 'playwright/test';
import { runCommand, waitForCommandEnabled } from './helpers/commands';

test.use({ viewport: { width: 2400, height: 1600 } });

const readMscx = (page: Page) =>
  page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { saveMsc?: (format: 'mscx') => Promise<Uint8Array> };
      }
    ).__webmscore;
    if (!score?.saveMsc) throw new Error('window.__webmscore.saveMsc is unavailable');
    return new TextDecoder().decode(await score.saveMsc('mscx'));
  });

const playbackMeasureIds = (page: Page) =>
  page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { savePositions?: (ofSegments: boolean) => Promise<string> };
      }
    ).__webmscore;
    if (!score?.savePositions) throw new Error('window.__webmscore.savePositions is unavailable');
    const positions = JSON.parse(await score.savePositions(false)) as {
      events: Array<{ elid: number }>;
    };
    return positions.events.map((event) => event.elid);
  });

const loadFourMeasures = async (page: Page) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  await expect(page.locator('svg .Note')).toHaveCount(4, { timeout: 20_000 });
};

const selectWholeNote = async (page: Page, index: number) => {
  const note = page.locator('svg .Note').nth(index);
  await expect(note).toBeVisible({ timeout: 20_000 });
  let box = await note.boundingBox();
  await expect
    .poll(
      async () => {
        box = await note.boundingBox();
        return box !== null;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  if (!box) throw new Error(`Note ${index} has no bounding box`);
  // Whole-note centers are transparent, so click the solid left rim.
  await page.mouse.click(box.x + 3, box.y + box.height / 2);
  await waitForCommandEnabled(page, 'btn-marker-5');
};

test('adds semantic double-segno navigation and expands the repeat playback list', async ({
  page,
}) => {
  await loadFourMeasures(page);
  expect(await playbackMeasureIds(page)).toEqual([0, 1, 2, 3]);

  await selectWholeNote(page, 0);
  // "Serpent segno" (varsegno) now lives in the Markers palette rather than the dropdown.
  await runCommand(page, 'btn-open-markers-palette');
  await page.getByTestId('palette-item-marker-1').click();
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => /<Marker>[\s\S]*?<label>varsegno<\/label>/.test(await readMscx(page)), {
      timeout: 20_000,
    })
    .toBe(true);

  await selectWholeNote(page, 3);
  // "Dal Segno Segno" (DSS) now lives in the Jumps palette.
  await runCommand(page, 'btn-open-jumps-palette');
  await page.getByTestId('palette-item-jump-8').click();
  await page.keyboard.press('Escape');
  await expect
    .poll(
      async () => {
        const xml = await readMscx(page);
        return /<Jump>[\s\S]*?<jumpTo>varsegno<\/jumpTo>[\s\S]*?<playUntil>end<\/playUntil>[\s\S]*?<continueAt(?:\/>|><\/continueAt>)/.test(
          xml,
        );
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect
    .poll(() => playbackMeasureIds(page), { timeout: 20_000 })
    .toEqual([0, 1, 2, 3, 0, 1, 2, 3]);

  await page.keyboard.press('Control+z');
  await expect.poll(() => playbackMeasureIds(page), { timeout: 20_000 }).toEqual([0, 1, 2, 3]);
  await page.keyboard.press('Control+y');
  await expect
    .poll(() => playbackMeasureIds(page), { timeout: 20_000 })
    .toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
});

test('uses MuseScore playback targets for D.C. al Fine', async ({ page }) => {
  await loadFourMeasures(page);

  await selectWholeNote(page, 2);
  await runCommand(page, 'btn-marker-5');
  await selectWholeNote(page, 3);
  await runCommand(page, 'btn-jump-1');

  await expect
    .poll(async () => /<Marker>[\s\S]*?<label>fine<\/label>/.test(await readMscx(page)), {
      timeout: 20_000,
    })
    .toBe(true);
  await expect
    .poll(
      async () =>
        /<Jump>[\s\S]*?<jumpTo>start<\/jumpTo>[\s\S]*?<playUntil>fine<\/playUntil>[\s\S]*?<continueAt(?:\/>|><\/continueAt>)/.test(
          await readMscx(page),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect
    .poll(() => playbackMeasureIds(page), { timeout: 20_000 })
    .toEqual([0, 1, 2, 3, 0, 1, 2]);
});

test('rejects a marker mutation when there is no selection', async ({ page }) => {
  await loadFourMeasures(page);
  const result = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { addMarker?: (type: number) => Promise<boolean> };
      }
    ).__webmscore;
    if (!score?.addMarker) throw new Error('window.__webmscore.addMarker is unavailable');
    return score.addMarker(0);
  });
  expect(result).toBe(false);
  expect((await readMscx(page)).includes('<Marker>')).toBe(false);
});
