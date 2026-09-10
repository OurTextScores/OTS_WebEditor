import { expect, test, type Page } from 'playwright/test';

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

const loadBatch4Score = async (page: Page) => {
  await page.goto('/?score=/test_scores/batch4_controls.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  await expect(page.locator('svg .Note')).toHaveCount(8, { timeout: 20_000 });
};

const setNoteheadDirect = (page: Page, group: number) =>
  page.evaluate(async (value) => {
    const score = (
      window as unknown as {
        __webmscore?: { setNoteheadGroup?: (group: number) => Promise<boolean> };
      }
    ).__webmscore;
    if (!score?.setNoteheadGroup)
      throw new Error('window.__webmscore.setNoteheadGroup is unavailable');
    return score.setNoteheadGroup(value);
  }, group);

const setSelectionFilterDirect = (page: Page, mask: number) =>
  page.evaluate(async (value) => {
    const score = (
      window as unknown as {
        __webmscore?: { setSelectionFilter?: (filterMask: number) => Promise<boolean> };
      }
    ).__webmscore;
    if (!score?.setSelectionFilter)
      throw new Error('window.__webmscore.setSelectionFilter is unavailable');
    return score.setSelectionFilter(value);
  }, mask);

const selectAllDirect = (page: Page) =>
  page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { selectAll?: () => Promise<boolean> };
      }
    ).__webmscore;
    if (!score?.selectAll) throw new Error('window.__webmscore.selectAll is unavailable');
    return score.selectAll();
  });

const multiMeasureRestsEnabled = (page: Page) =>
  page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { multiMeasureRestsEnabled?: () => Promise<boolean> };
      }
    ).__webmscore;
    if (!score?.multiMeasureRestsEnabled) {
      throw new Error('window.__webmscore.multiMeasureRestsEnabled is unavailable');
    }
    return score.multiMeasureRestsEnabled();
  });

const reloadCurrentMscz = async (page: Page) => {
  const bytes = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { saveMsc?: (format: 'mscz') => Promise<Uint8Array> };
      }
    ).__webmscore;
    if (!score?.saveMsc) throw new Error('window.__webmscore.saveMsc is unavailable');
    (score as typeof score & { __batch4Replaced?: boolean }).__batch4Replaced = true;
    return Array.from(await score.saveMsc('mscz'));
  });
  await page.getByTestId('open-score-input').setInputFiles({
    name: 'batch4-controls.mscz',
    mimeType: 'application/vnd.musescore',
    buffer: Buffer.from(bytes),
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const score = (window as unknown as { __webmscore?: { __batch4Replaced?: boolean } })
            .__webmscore;
          return Boolean(score && !score.__batch4Replaced);
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await expect(page.getByTestId('btn-note-input')).toBeEnabled({ timeout: 60_000 });
};

test('applies typed notehead and beam properties with undo and redo', async ({ page }) => {
  await loadBatch4Score(page);

  await page.locator('svg .Note').nth(0).click();
  // Noteheads now live entirely in the floating palette.
  await page.getByTestId('btn-toggle-palettes').click();
  await page.getByTestId('palette-item-notehead-1').click();
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await readMscx(page)).includes('<head>cross</head>'), { timeout: 20_000 })
    .toBe(true);

  await page.locator('svg .Note').nth(1).click();
  await page.getByTestId('dropdown-beams').click();
  await page.getByTestId('btn-beam-2').click();
  await expect
    .poll(async () => (await readMscx(page)).includes('<BeamMode>begin</BeamMode>'), {
      timeout: 20_000,
    })
    .toBe(true);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await readMscx(page)).includes('<BeamMode>begin</BeamMode>'), {
      timeout: 20_000,
    })
    .toBe(false);
  await page.keyboard.press('Control+y');
  await expect
    .poll(async () => (await readMscx(page)).includes('<BeamMode>begin</BeamMode>'), {
      timeout: 20_000,
    })
    .toBe(true);
});

test('persists the notes/rests selection filter and applies it in the engine', async ({ page }) => {
  await loadBatch4Score(page);
  await page.keyboard.press('Control+a');

  await page.getByTestId('dropdown-selection-filter').click();
  await page.getByTestId(`selection-filter-${1 << 23}`).click();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('ots_editor_selection_filter_v1')))
    .toBe(String(0x7fffff));
  expect(await setSelectionFilterDirect(page, 0x7fffff)).toBe(true);
  expect(await selectAllDirect(page)).toBe(false);
  expect(await setNoteheadDirect(page, 1)).toBe(false);
  expect((await readMscx(page)).includes('<head>cross</head>')).toBe(false);

  await page.reload();
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  expect(await setSelectionFilterDirect(page, 0x7fffff)).toBe(true);
  expect(await selectAllDirect(page)).toBe(false);
  expect(await setNoteheadDirect(page, 1)).toBe(false);

  await page.getByTestId('dropdown-selection-filter').click();
  await page.getByTestId(`selection-filter-${1 << 23}`).click();
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('ots_editor_selection_filter_v1')))
    .toBe(String(0xffffff));
  expect(await setSelectionFilterDirect(page, 0xffffff)).toBe(true);
  expect(await selectAllDirect(page)).toBe(true);
  expect(await setNoteheadDirect(page, 1)).toBe(true);
  await expect
    .poll(async () => (await readMscx(page)).includes('<head>cross</head>'), { timeout: 20_000 })
    .toBe(true);
});

test('creates semantic measure-repeat groups without replacing non-empty measures', async ({
  page,
}) => {
  await loadBatch4Score(page);
  const rests = page.locator('svg .Rest');
  await expect(rests).toHaveCount(4, { timeout: 20_000 });
  await rests.first().click();

  // The measure-repeat toolbar control was retired; drive the engine directly.
  const added = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { addMeasureRepeat?: (count: number) => Promise<boolean> };
      }
    ).__webmscore;
    if (!score?.addMeasureRepeat)
      throw new Error('window.__webmscore.addMeasureRepeat is unavailable');
    return score.addMeasureRepeat(2);
  });
  expect(added).toBe(true);
  await expect
    .poll(async () => /<MeasureRepeat>[\s\S]*?<subtype>2<\/subtype>/.test(await readMscx(page)), {
      timeout: 20_000,
    })
    .toBe(true);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await readMscx(page)).includes('<MeasureRepeat>'), { timeout: 20_000 })
    .toBe(false);
  await page.keyboard.press('Control+y');
  await expect
    .poll(async () => (await readMscx(page)).includes('<MeasureRepeat>'), { timeout: 20_000 })
    .toBe(true);

  await page.reload();
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  await page.locator('svg .Note').first().click();
  const rejected = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { addMeasureRepeat?: (count: number) => Promise<boolean> };
      }
    ).__webmscore;
    if (!score?.addMeasureRepeat)
      throw new Error('window.__webmscore.addMeasureRepeat is unavailable');
    return score.addMeasureRepeat(1);
  });
  expect(rejected).toBe(false);
});

test('toggles multi-measure rests as an undoable score style', async ({ page }) => {
  await loadBatch4Score(page);
  // The multi-measure-rest toolbar toggle was retired; drive the engine directly.
  const setMultiMeasureRests = (enabled: boolean) =>
    page.evaluate(async (value) => {
      const score = (
        window as unknown as {
          __webmscore?: { setMultiMeasureRests?: (on: boolean) => Promise<boolean> };
        }
      ).__webmscore;
      if (!score?.setMultiMeasureRests)
        throw new Error('window.__webmscore.setMultiMeasureRests is unavailable');
      return score.setMultiMeasureRests(value);
    }, enabled);

  await expect.poll(() => multiMeasureRestsEnabled(page), { timeout: 20_000 }).toBe(false);
  expect(await setMultiMeasureRests(true)).toBe(true);
  await expect.poll(() => multiMeasureRestsEnabled(page), { timeout: 20_000 }).toBe(true);

  await page.keyboard.press('Control+z');
  await expect.poll(() => multiMeasureRestsEnabled(page), { timeout: 20_000 }).toBe(false);
  await page.keyboard.press('Control+y');
  await expect.poll(() => multiMeasureRestsEnabled(page), { timeout: 20_000 }).toBe(true);

  await reloadCurrentMscz(page);
  await expect.poll(() => multiMeasureRestsEnabled(page), { timeout: 20_000 }).toBe(true);
});
