import { expect, test, type Page } from 'playwright/test';
import { runCommand } from './helpers/commands';

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

const loadTwoChords = async (page: Page) => {
  await page.goto('/?score=/test_scores/two_chords.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  await expect(page.getByTestId('btn-note-input')).toBeEnabled({ timeout: 20_000 });
};

test('adds non-default fermata and caesura variants with undo and redo', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  await page.locator('svg .Note').first().click();

  await runCommand(page, 'btn-open-fermata-palette');
  await page.getByTestId('palette-item-fermata-4').click();
  await expect
    .poll(
      async () =>
        /<Fermata>[\s\S]*?<subtype>fermataVeryLongAbove<\/subtype>/.test(await readMscx(page)),
      { timeout: 20_000 },
    )
    .toBe(true);

  await runCommand(page, 'btn-open-breath-palette');
  await page.getByTestId('palette-item-breath-7').click();
  await expect
    .poll(async () => /<Breath>[\s\S]*?<symbol>caesuraThick<\/symbol>/.test(await readMscx(page)), {
      timeout: 20_000,
    })
    .toBe(true);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await readMscx(page)).includes('caesuraThick'), { timeout: 20_000 })
    .toBe(false);
  await page.keyboard.press('Control+y');
  await expect
    .poll(async () => (await readMscx(page)).includes('caesuraThick'), { timeout: 20_000 })
    .toBe(true);
});

test('adds and serializes a bracket arpeggio on each selected chord', async ({ page }) => {
  await loadTwoChords(page);
  await page.keyboard.press('Control+a');
  await runCommand(page, 'btn-arpeggio-3');

  await expect
    .poll(async () => (await readMscx(page)).match(/<Arpeggio>/g)?.length ?? 0, { timeout: 20_000 })
    .toBe(2);
  await expect
    .poll(async () => (await readMscx(page)).match(/<subtype>3<\/subtype>/g)?.length ?? 0, {
      timeout: 20_000,
    })
    .toBe(2);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await readMscx(page)).includes('<Arpeggio>'), { timeout: 20_000 })
    .toBe(false);
});

test('adds single-note and compatible two-note tremolos', async ({ page }) => {
  await loadTwoChords(page);
  await page.keyboard.press('Control+a');
  await runCommand(page, 'btn-tremolo-2');
  await expect
    .poll(
      async () =>
        (await readMscx(page)).match(/<Tremolo>[\s\S]*?<subtype>r32<\/subtype>/g)?.length ?? 0,
      { timeout: 20_000 },
    )
    .toBe(2);

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+a');
  await runCommand(page, 'btn-open-tremolo-palette');
  await page.getByTestId('palette-item-tremolo-7').click();
  await expect
    .poll(async () => /<Tremolo>[\s\S]*?<subtype>c32<\/subtype>/.test(await readMscx(page)), {
      timeout: 20_000,
    })
    .toBe(true);
});

test('rejects two-note tremolo without exactly two selected chords', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  await page.locator('svg .Note').first().click();

  const result = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { addTremolo?: (type: number) => Promise<boolean> };
      }
    ).__webmscore;
    if (!score?.addTremolo) throw new Error('window.__webmscore.addTremolo is unavailable');
    return score.addTremolo(7);
  });
  expect(result).toBe(false);
  expect((await readMscx(page)).includes('<Tremolo>')).toBe(false);
});
