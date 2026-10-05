import { expect, test, type Page } from 'playwright/test';
import { runCommand } from './helpers/commands';

test.use({ viewport: { width: 2400, height: 1600 } });

const readMscx = (page: Page) =>
  page.evaluate(async () => {
    const score = (
      window as unknown as { __webmscore?: { saveMsc?: (format: 'mscx') => Promise<Uint8Array> } }
    ).__webmscore;
    if (!score?.saveMsc) throw new Error('window.__webmscore.saveMsc is unavailable');
    return new TextDecoder().decode(await score.saveMsc('mscx'));
  });

const callScore = (page: Page, method: string, ...args: unknown[]) =>
  page.evaluate(
    async ({ name, values }) => {
      const score = (
        window as unknown as {
          __webmscore?: Record<string, (...methodArgs: unknown[]) => Promise<unknown>>;
        }
      ).__webmscore;
      const fn = score?.[name];
      if (typeof fn !== 'function') throw new Error(`${name} is unavailable`);
      return fn.apply(score, values);
    },
    { name: method, values: args },
  );

const selectAll = async (page: Page) => {
  await page.keyboard.press('Control+a');
  await expect
    .poll(async () => {
      const boxes = (await callScore(page, 'getSelectionBoundingBoxes')) as unknown[];
      return boxes.length;
    })
    .toBeGreaterThan(0);
};

const reloadCurrentMscz = async (page: Page) => {
  const bytes = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: {
          saveMsc?: (format: 'mscz') => Promise<Uint8Array>;
          __batch6Replaced?: boolean;
        };
      }
    ).__webmscore;
    if (!score?.saveMsc) throw new Error('window.__webmscore.saveMsc is unavailable');
    score.__batch6Replaced = true;
    return Array.from(await score.saveMsc('mscz'));
  });
  await page.getByTestId('open-score-input').setInputFiles({
    name: 'batch6-tools.mscz',
    mimeType: 'application/vnd.musescore',
    buffer: Buffer.from(bytes),
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const score = (window as unknown as { __webmscore?: { __batch6Replaced?: boolean } })
            .__webmscore;
          return Boolean(score && !score.__batch6Replaced);
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
};

test('creates and edits a persistent fretboard diagram and adds an ambitus', async ({ page }) => {
  await page.goto('/?score=/test_scores/batch6_tools.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  await selectAll(page);
  await runCommand(page, 'btn-fretboard-c');
  await expect
    .poll(async () => (await readMscx(page)).includes('<FretDiagram>'), { timeout: 20_000 })
    .toBe(true);

  const diagram = page.locator('svg .FretDiagram').first();
  await diagram.waitFor({ timeout: 20_000, state: 'attached' });
  await runCommand(page, 'view.panel.properties');
  await expect(page.getByTestId('fretboard-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('fretboard-cell-5-4').click();
  await expect
    .poll(
      async () => {
        const value = (await callScore(page, 'getSelectedFretDiagram')) as {
          dots: Array<{ string: number; fret: number }>;
        };
        return value.dots.some((dot) => dot.string === 5 && dot.fret === 4);
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  const rejected = await callScore(page, 'setSelectedFretDiagram', {
    strings: 99,
    frets: 4,
    fretOffset: 0,
    showNut: true,
    dots: [],
    markers: [],
    barres: [],
  });
  expect(rejected).toBe(false);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const value = (await callScore(page, 'getSelectedFretDiagram')) as {
        dots: Array<{ string: number; fret: number }>;
      };
      return value.dots.some((dot) => dot.string === 5 && dot.fret === 4);
    })
    .toBe(false);
  await page.keyboard.press('Control+y');
  await reloadCurrentMscz(page);
  await expect
    .poll(async () => (await readMscx(page)).includes('<FretDiagram>'), { timeout: 20_000 })
    .toBe(true);

  await selectAll(page);
  expect(await callScore(page, 'addAmbitus')).toBe(true);
  await expect
    .poll(async () => (await readMscx(page)).includes('<Ambitus>'), { timeout: 20_000 })
    .toBe(true);
  // The engine was called directly, with no pointer or key release for the editor to notice (a real edit has one).
  await page.keyboard.press('Shift');
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await readMscx(page)).includes('<Ambitus>')).toBe(false);
  await page.keyboard.press('Control+y');
  await expect.poll(async () => (await readMscx(page)).includes('<Ambitus>')).toBe(true);
});

test('runs range-only regroup, rehearsal resequence, explode, and implode commands', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/batch6_tools.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });

  expect(await callScore(page, 'explodeSelection')).toBe(false);

  await callScore(page, 'selectAll');
  const beforeRegroup = await readMscx(page);
  expect(await callScore(page, 'regroupSelection')).toBe(true);
  const afterRegroup = await readMscx(page);
  expect(afterRegroup).not.toBe(beforeRegroup);
  await callScore(page, 'undo');
  expect(await readMscx(page)).toBe(beforeRegroup);

  await callScore(page, 'selectAll');
  expect(await callScore(page, 'resequenceRehearsalMarks')).toBe(true);
  const resequenced = await readMscx(page);
  expect(resequenced).toContain('<text>B</text>');
  expect(resequenced).toContain('<text>C</text>');
  await callScore(page, 'undo');

  await callScore(page, 'selectAll');
  const beforeExplode = await readMscx(page);
  expect(await callScore(page, 'explodeSelection')).toBe(true);
  const afterExplode = await readMscx(page);
  expect(afterExplode).not.toBe(beforeExplode);
  expect(await callScore(page, 'implodeSelection')).toBe(true);
  const afterImplode = await readMscx(page);
  expect(afterImplode).not.toBe(afterExplode);
  await callScore(page, 'undo');
  expect(await readMscx(page)).toBe(afterExplode);
});

test('opens, searches, moves, and click-applies the floating palettes', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  // The palettes dock in the side panel by default; this exercises the floating form.
  await page.getByTestId('btn-palettes-pop-out').click();
  const palettes = page.getByTestId('floating-palettes');
  await expect(palettes).toBeVisible();
  const before = await palettes.boundingBox();
  const handle = await page.getByTestId('floating-palettes-handle').boundingBox();
  if (!handle) throw new Error('Floating palette handle is unavailable');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  // The palette opens at the right edge and cannot leave the window, so it is moved left.
  await page.mouse.move(handle.x + handle.width / 2 - 240, handle.y + handle.height / 2 + 100, {
    steps: 5,
  });
  await page.mouse.up();
  const after = await palettes.boundingBox();
  expect(after?.x).not.toBe(before?.x);

  await page.getByTestId('palette-search').fill('accent');
  await page.getByTestId('palette-item-articulation-3').click();
  await expect
    .poll(
      async () => {
        const xml = await readMscx(page);
        return xml.includes('articAccentAbove') || xml.includes('articAccentBelow');
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await page.getByTestId('btn-close-palettes').click();
  await expect(palettes).not.toBeVisible();
});
