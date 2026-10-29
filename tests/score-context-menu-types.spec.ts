import { expect, test, type Page } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand, runCommandAnsweringPrompt } from './helpers/commands';

/**
 * The score's type-specific right-click menus (MuseScore's makeItemsByElementType) and note
 * input's right-click (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md, Phase 3).
 */

const FOUR_MEASURES = '/?score=/test_scores/four_measures.musicxml';

const menu = (page: Page) => page.getByTestId('score-context-menu');

const readXml = (page: Page): Promise<string> =>
  page.evaluate(async () => (window as BrowserScoreWindow).__webmscore!.saveXml!());

const readPitches = async (page: Page): Promise<string[]> =>
  Array.from(
    (await readXml(page)).matchAll(
      /<pitch>\s*<step>([A-G])<\/step>\s*<octave>(\d+)<\/octave>\s*<\/pitch>/g,
    ),
  ).map((m) => `${m[1]}${m[2]}`);

async function open(page: Page, url = FOUR_MEASURES) {
  await page.goto(url);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
}

async function centre(page: Page, selector: string, index = 0) {
  const box = await page.locator(selector).nth(index).boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

interface ContextWindow {
  __webmscore: {
    contextSelectionInfo(): Promise<{
      hit: { type: string; flags: { snapAfter?: boolean } } | null;
      selection: { kind: string; type: string | null };
    }>;
  };
}

/** The engine's own account of the selection (contexthit.h). */
const selectionReport = (page: Page) =>
  page.evaluate(() => (window as unknown as ContextWindow).__webmscore.contextSelectionInfo());

async function rightClick(page: Page, point: { x: number; y: number }) {
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
}

test('in note input, a right-click turns the note there into a rest, and opens no menu', async ({ page }) => {
  await open(page);
  await expect.poll(() => readPitches(page), { timeout: 20_000 }).toEqual(['F4', 'A4', 'C5', 'E5']);
  const first = await centre(page, 'svg .Note', 0);
  const second = await centre(page, 'svg .Note', 1);
  await page.mouse.click(first.x, first.y);
  await runCommand(page, 'add.noteInput');
  // The command resolves before the editor's note-input state is set.
  await expect(page.locator('button', { hasText: 'Stop input' })).toBeVisible();

  await page.mouse.click(second.x, second.y, { button: 'right' });
  await expect.poll(() => readPitches(page), { timeout: 20_000 }).toEqual(['F4', 'C5', 'E5']);
  await expect(menu(page)).toHaveCount(0);
});

test('a time signature’s menu opens the Properties panel', async ({ page }) => {
  await open(page);
  await rightClick(page, await centre(page, 'svg .TimeSig'));
  await page.getByTestId('context-item-format.elementProperties-time-signature-properties').click();
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
});

test('a hairpin’s Snap to Next shows its state and toggles it', async ({ page }) => {
  await open(page);
  const note = await centre(page, 'svg .Note', 0);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.line.hairpin', 0);
  await page.waitForSelector('svg .HairpinSegment', { timeout: 20_000 });

  const hairpin = await centre(page, 'svg .HairpinSegment');
  await rightClick(page, hairpin);
  const snap = page.getByTestId('context-item-format.snap.next');
  await expect(page.getByTestId('context-item-format.snap.previous')).toBeVisible();
  const before = await snap.getAttribute('aria-checked');
  // The right-click left the engine holding the hairpin, as the snaps act on it.
  expect(await selectionReport(page)).toMatchObject({ selection: { kind: 'single', type: 'HairpinSegment' } });
  await snap.click();
  await expect(menu(page)).toHaveCount(0);
  await expect
    .poll(async () => (await selectionReport(page)).hit?.flags?.snapAfter)
    .toBe(before !== 'true');

  await rightClick(page, await centre(page, 'svg .HairpinSegment'));
  await expect(page.getByTestId('context-item-format.snap.next')).toHaveAttribute(
    'aria-checked',
    before === 'true' ? 'false' : 'true',
  );
});

test('Add Fretboard Diagram on a chord symbol puts it on a diagram of its chord', async ({ page }) => {
  await open(page);
  const note = await centre(page, 'svg .Note', 0);
  await page.mouse.click(note.x, note.y);
  await runCommandAnsweringPrompt(page, 'add.text.harmony', 'C', 0);
  await page.waitForSelector('svg .Harmony', { timeout: 20_000 });

  await rightClick(page, await centre(page, 'svg .Harmony'));
  await page.getByTestId('context-item-add.fretboardForHarmony-add-fretboard-diagram').click();
  await page.waitForSelector('svg .FretDiagram', { state: 'attached', timeout: 20_000 });

  // Now the symbol sits on a diagram, so neither offers to add the other.
  await rightClick(page, await centre(page, 'svg .FretDiagram'));
  await expect(page.getByTestId('context-item-edit.copy')).toBeVisible();
  await expect(page.getByTestId('context-item-add.text.harmony-add-chord-symbol')).toHaveCount(0);
});

test('a frame’s Add ▸ Composer adds composer text to that frame', async ({ page }) => {
  await open(page, '/?score=/test_scores/credits_small_staff.musicxml');
  // Blank frame space level with the centred subtitle (the tallest text), at the staff's left
  // edge. The frame itself is not drawn in the SVG; the engine finds it from its layout.
  const texts = await page.locator('svg .Text').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect()).map((r) => ({ y: r.top + r.height / 2, h: r.height })),
  );
  const staff = await page.locator('svg .StaffLines').first().boundingBox();
  if (!texts.length || !staff) throw new Error('no subtitle or staff');
  const subtitle = texts.reduce((tallest, text) => (text.h > tallest.h ? text : tallest));
  await rightClick(page, { x: staff.x + 5, y: subtitle.y });

  await page.getByTestId('context-sub-add').click();
  const run = page.getByTestId('context-item-add.frameText-composer').click();
  const input = page.getByTestId('prompt-dialog-input');
  await run;
  await input.fill('Context Composer');
  await page.getByTestId('dialog-confirm').click();
  await expect.poll(() => readXml(page), { timeout: 20_000 }).toContain('Context Composer');
});

test('Delete in a hairpin’s menu deletes the hairpin, not the note selected before it', async ({ page }) => {
  await open(page);
  const note = await centre(page, 'svg .Note', 0);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.line.hairpin', 0);
  await page.waitForSelector('svg .HairpinSegment', { timeout: 20_000 });

  await rightClick(page, await centre(page, 'svg .HairpinSegment'));
  await page.getByTestId('context-item-edit.delete').click();
  await expect(page.locator('svg .HairpinSegment')).toHaveCount(0, { timeout: 20_000 });
  expect(await readPitches(page)).toEqual(['F4', 'A4', 'C5', 'E5']);
});

test('a left-click on a hairpin, then Delete, deletes the hairpin, not the note clicked before', async ({ page }) => {
  await open(page);
  const note = await centre(page, 'svg .Note', 0);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.line.hairpin', 0);
  await page.waitForSelector('svg .HairpinSegment', { timeout: 20_000 });

  const hairpin = await centre(page, 'svg .HairpinSegment');
  await page.mouse.click(note.x, note.y);
  await page.mouse.click(hairpin.x, hairpin.y);
  // The click selects the hairpin in the engine (it is selected as its spanner).
  await expect
    .poll(async () => (await selectionReport(page)).selection)
    .toEqual({ kind: 'single', type: 'HairpinSegment' });
  await runCommand(page, 'edit.delete');
  await expect(page.locator('svg .HairpinSegment')).toHaveCount(0, { timeout: 20_000 });
  expect(await readPitches(page)).toEqual(['F4', 'A4', 'C5', 'E5']);
});
