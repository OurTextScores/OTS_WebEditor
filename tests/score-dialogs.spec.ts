import path from 'node:path';
import { expect, test, type Page } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommandAnsweringPrompt } from './helpers/commands';

/**
 * The score's settings dialogs, opened from the right-click menu as in MuseScore
 * (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md, Phase 4): each one changes the score in the engine.
 */

const SCORE = '/?score=/test_scores/four_measures.musicxml';

interface DialogWindow {
  __webmscore: {
    getStyleValues(keys: string[]): Promise<Record<string, number | boolean | string>>;
    getSelectedElementProperties(): Promise<{ selectionCount: number; elementType: string }>;
    getStaffProperties(staffIdx: number): Promise<{ shortName?: string; small?: boolean }>;
  };
}

const menu = (page: Page) => page.getByTestId('score-context-menu');
const dialog = (page: Page) => page.getByTestId('score-dialog');

const style = (page: Page, keys: string[]) =>
  page.evaluate((k) => (window as unknown as DialogWindow).__webmscore.getStyleValues(k), keys);
const selectionCount = (page: Page) =>
  page.evaluate(async () => (await (window as unknown as DialogWindow).__webmscore.getSelectedElementProperties()).selectionCount);
const readXml = (page: Page): Promise<string> =>
  page.evaluate(async () => (window as BrowserScoreWindow).__webmscore!.saveXml!());
const noteCount = async (page: Page) => ((await readXml(page)).match(/<note[ >]/g) ?? []).length;

async function open(page: Page) {
  await page.goto(SCORE);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
}

async function centre(page: Page, selector: string, index = 0) {
  const box = await page.locator(selector).nth(index).boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Blank paper below the score's only system. */
async function paper(page: Page) {
  const note = await centre(page, 'svg .Note', 1);
  return { x: note.x, y: note.y + 120 };
}

/** Empty staff space in bar `bar` (0-based): between its note and the next. */
async function barSpace(page: Page, bar: number) {
  const a = await page.locator('svg .Note').nth(bar).boundingBox();
  const b = await page.locator('svg .Note').nth(bar + 1).boundingBox();
  if (!a || !b) throw new Error('no notes');
  return { x: (a.x + a.width + b.x) / 2, y: a.y + a.height / 2 };
}

async function rightClick(page: Page, point: { x: number; y: number }) {
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
}

async function submit(page: Page) {
  await page.getByTestId('score-dialog-submit').click();
  await expect(dialog(page)).toHaveCount(0);
}

test('Style… from the page menu changes a style value', async ({ page }) => {
  await open(page);
  await rightClick(page, await paper(page));
  await page.getByTestId('context-item-format.style').click();
  await expect(dialog(page)).toBeVisible();
  await page.getByTestId('score-dialog-minNoteDistance').fill('0.8');
  await page.getByTestId('score-dialog-hideEmptyStaves').check();
  await submit(page);
  await expect.poll(() => style(page, ['minNoteDistance', 'hideEmptyStaves'])).toEqual({
    hideEmptyStaves: true,
    minNoteDistance: 0.8,
  });
});

test('Page Settings… shows millimetres and writes the page size back', async ({ page }) => {
  await open(page);
  await rightClick(page, await paper(page));
  await page.getByTestId('context-item-format.pageSettings').click();
  await expect(page.getByTestId('score-dialog-pageWidth')).toHaveValue(/^2\d\d(\.\d+)?$/);
  await page.getByTestId('score-dialog-pageWidth').fill('254');
  await submit(page);
  await expect.poll(async () => Number((await style(page, ['pageWidth'])).pageWidth)).toBeCloseTo(10, 3);
});

test('Load Style… loads a MuseScore style file', async ({ page }) => {
  await open(page);
  await rightClick(page, await paper(page));
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('context-item-format.loadStyle').click();
  await (await chooser).setFiles(path.join(__dirname, '../public/test_scores/styles/MuseJazz.mss'));
  await expect.poll(async () => (await style(page, ['musicalSymbolFont'])).musicalSymbolFont).toBe('MuseJazz');
});

test('Measure Properties… on a bar excludes it from the count', async ({ page }) => {
  await open(page);
  await rightClick(page, await barSpace(page, 1));
  await page.getByTestId('context-item-measure.properties').click();
  await expect(page.getByTestId('score-dialog-actualNumerator')).toHaveValue('4');
  await page.getByTestId('score-dialog-irregular').check();
  await submit(page);
  // MusicXML marks a bar excluded from the count as implicit.
  await expect.poll(async () => (await readXml(page)).match(/<measure number="[^"]*" implicit="yes"/g)?.length ?? 0).toBe(1);
});

test('Select ▸ More… on a note selects the notes it filters to', async ({ page }) => {
  await open(page);
  await rightClick(page, await centre(page, 'svg .Note', 1));
  await page.getByTestId('context-sub-select').click();
  await page.getByTestId('context-item-edit.select.more-more').click();
  await expect(page.getByTestId('score-dialog-samePitch')).toBeVisible();
  await submit(page);
  await expect.poll(() => selectionCount(page)).toBe(4);

  await rightClick(page, await centre(page, 'svg .Note', 1));
  await page.getByTestId('context-sub-select').click();
  await page.getByTestId('context-item-edit.select.more-more').click();
  await page.getByTestId('score-dialog-sameMeasure').check();
  await submit(page);
  await expect.poll(() => selectionCount(page)).toBe(1);
});

test('Realize Chord Symbols… turns a chord symbol into notes', async ({ page }) => {
  await open(page);
  const note = await centre(page, 'svg .Note', 0);
  await page.mouse.click(note.x, note.y);
  await runCommandAnsweringPrompt(page, 'add.text.harmony', 'C', 0);
  await page.waitForSelector('svg .Harmony', { state: 'attached', timeout: 20_000 });
  const before = await noteCount(page);

  await rightClick(page, await centre(page, 'svg .Harmony'));
  await page.getByTestId('context-item-tools.realizeHarmony').click();
  await expect(page.getByTestId('score-dialog-literal')).toBeChecked();
  // Until the end of the bar: one triad (the default lasts until the next chord symbol, every bar here).
  await page.getByTestId('score-dialog-duration').selectOption('1');
  await submit(page);
  await expect.poll(() => noteCount(page)).toBe(before + 3);
});

test('Staff/Part Properties… from the instrument name edits that staff', async ({ page }) => {
  await open(page);
  await rightClick(page, await centre(page, 'svg .InstrumentName'));
  await page.getByTestId('context-item-instruments.staffProperties').click();
  await expect(page.getByTestId('score-dialog-longName')).toHaveValue('Piano');
  await page.getByTestId('score-dialog-shortName').fill('Pf.');
  await page.getByTestId('score-dialog-small').check();
  await submit(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as DialogWindow).__webmscore.getStaffProperties(0)))
    .toMatchObject({ shortName: 'Pf.', small: true });
});

test('Select Instrument… on an instrument change switches the part from there', async ({ page }) => {
  await open(page);
  const note = await centre(page, 'svg .Note', 2);
  await page.mouse.click(note.x, note.y);
  await runCommandAnsweringPrompt(page, 'add.text.instrumentChange', 'To flute');
  await page.waitForSelector('svg .InstrumentChange', { state: 'attached', timeout: 20_000 });

  await rightClick(page, await centre(page, 'svg .InstrumentChange'));
  await page.getByTestId('context-item-instruments.changeAt').click();
  await page.getByTestId('score-dialog-instrument').selectOption('flute');
  await submit(page);
  await expect.poll(async () => (await readXml(page)).includes('<instrument-name>Flute</instrument-name>')).toBe(true);
});

test('a frame’s Add ▸ Image puts the image in the frame', async ({ page }) => {
  await page.goto('/?score=/test_scores/credits_small_staff.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  // Blank frame space level with the centred subtitle (the tallest text), at the staff's left edge.
  const texts = await page.locator('svg .Text').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect()).map((r) => ({ y: r.top + r.height / 2, h: r.height })),
  );
  const staff = await page.locator('svg .StaffLines').first().boundingBox();
  if (!texts.length || !staff) throw new Error('no subtitle or staff');
  const subtitle = texts.reduce((tallest, text) => (text.h > tallest.h ? text : tallest));
  await rightClick(page, { x: staff.x + 5, y: subtitle.y });

  await page.getByTestId('context-sub-add').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('context-item-add.image').click();
  await (await chooser).setFiles(path.join(__dirname, '../public/test_scores/images/square.png'));
  await page.waitForSelector('svg .Image', { state: 'attached', timeout: 20_000 });
});
