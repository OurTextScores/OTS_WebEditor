import { expect, test, type Page } from './helpers/diagnostic-test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand } from './helpers/commands';

/**
 * The score's right-click menu, against MuseScore 4.7's behaviour
 * (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md, Part A): what a right-click
 * selects, which menu it opens, and that its entries run the real commands.
 */

const SCORE = '/?score=/test_scores/four_measures.musicxml';

interface SelectionWindow {
  __webmscore: {
    isSelectionRange(): Promise<boolean>;
    getSelectedElementProperties(): Promise<{ selectionCount: number; elementType: string }>;
  };
}

const readPitches = (page: Page): Promise<string[]> =>
  page.evaluate(async () => {
    const xml: string = await (window as BrowserScoreWindow).__webmscore!.saveXml!();
    return Array.from(
      xml.matchAll(/<pitch>\s*<step>([A-G])<\/step>\s*<octave>(\d+)<\/octave>\s*<\/pitch>/g),
    ).map((m) => `${m[1]}${m[2]}`);
  });

const engineSelection = (page: Page) =>
  page.evaluate(async () => {
    const score = (window as unknown as SelectionWindow).__webmscore;
    const [range, properties] = await Promise.all([
      score.isSelectionRange(),
      score.getSelectedElementProperties(),
    ]);
    return { range, count: properties.selectionCount, type: properties.elementType };
  });

const menu = (page: Page) => page.getByTestId('score-context-menu');

async function open(page: Page) {
  await page.goto(SCORE);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect.poll(() => readPitches(page), { timeout: 20_000 }).toEqual(['F4', 'A4', 'C5', 'E5']);
}

/** Centre of the n-th notehead. */
async function noteCentre(page: Page, index: number) {
  // A selection change re-renders the SVG; read the box once the new note element is in place.
  let box: Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>> = null;
  await expect
    .poll(async () => (box = await page.locator('svg .Note').nth(index).boundingBox()) !== null)
    .toBe(true);
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Empty staff space in bar `n` (0-based, 0..2): between its note and the next bar's. */
async function barSpace(page: Page, bar: number) {
  const notes = page.locator('svg .Note');
  let point: { x: number; y: number } | undefined;
  // Edits replace the SVG asynchronously, so the notes may briefly have no boxes.
  await expect.poll(async () => {
    const a = await notes.nth(bar).boundingBox();
    const b = await notes.nth(bar + 1).boundingBox();
    if (!a || !b) return false;
    point = { x: (a.x + a.width + b.x) / 2, y: a.y + a.height / 2 };
    return true;
  }, { timeout: 20_000 }).toBe(true);
  return point!;
}

/** Blank paper well below the score's only system, still on screen: no element, no bar. */
async function blankPaper(page: Page) {
  const note = await noteCentre(page, 1);
  return { x: note.x, y: note.y + 120 };
}

test('right-clicking a note selects it and opens the element menu', async ({ page }) => {
  await open(page);
  const note = await noteCentre(page, 1);
  await page.mouse.click(note.x, note.y, { button: 'right' });

  await expect(menu(page)).toBeVisible();
  await expect.poll(() => engineSelection(page)).toMatchObject({ range: false, count: 1, type: 'Note' });
  for (const id of ['edit.cut', 'edit.copy', 'edit.paste', 'edit.swapClipboard', 'edit.delete']) {
    await expect(page.getByTestId(`context-item-${id}`)).toBeVisible();
  }
  // A note has no grips and no text: Edit Element would do nothing, so it is not offered.
  await expect(page.getByTestId('context-item-edit.element')).toHaveCount(0);
  // Bar entries belong to the measure menu only.
  await expect(page.getByTestId('context-sub-insert-measures')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
});

test('right-clicking staff space opens the measure menu, and Delete Measures removes the bar', async ({ page }) => {
  await open(page);
  const space = await barSpace(page, 1);
  await page.mouse.click(space.x, space.y, { button: 'right' });

  await expect(menu(page)).toBeVisible();
  await expect.poll(async () => (await engineSelection(page)).range).toBe(true);
  await expect(page.getByTestId('context-item-edit.delete-clear-measures')).toHaveText(/Clear Measures/);
  await expect(page.getByTestId('context-sub-insert-measures')).toBeVisible();

  await page.getByTestId('context-item-tools.measures.removeSelected-delete-measures').click();
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => readPitches(page), { timeout: 20_000 }).toEqual(['F4', 'C5', 'E5']);

  await runCommand(page, 'edit.undo');
  await expect.poll(() => readPitches(page), { timeout: 20_000 }).toEqual(['F4', 'A4', 'C5', 'E5']);
});

test('a right-click inside a selected range keeps the range', async ({ page }) => {
  await open(page);
  const first = await barSpace(page, 0);
  const second = await barSpace(page, 1);
  await page.mouse.click(first.x, first.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(second.x, second.y);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await engineSelection(page)).range).toBe(true);
  const before = await engineSelection(page);

  // A note in the range: the range stays, and the menu is the note's (MuseScore's hit type).
  const note = await noteCentre(page, 1);
  await page.mouse.click(note.x, note.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(page.getByTestId('context-item-edit.copy')).toBeVisible();
  await expect(page.getByTestId('context-sub-insert-measures')).toHaveCount(0);
  expect(await engineSelection(page)).toEqual(before);
});

test('a right-click on blank paper keeps the selection and opens its menu', async ({ page }) => {
  await open(page);
  const note = await noteCentre(page, 0);
  await page.mouse.click(note.x, note.y);
  await expect.poll(async () => (await engineSelection(page)).type).toBe('Note');

  const paper = await blankPaper(page);
  await page.mouse.click(paper.x, paper.y, { button: 'right' });

  await expect(menu(page)).toBeVisible();
  // The selected note's menu (MuseScore's currentElement fallback), not the page menu.
  await expect(page.getByTestId('context-item-edit.copy')).toBeVisible();
  await expect(page.getByTestId('context-item-format.pageSettings')).toHaveCount(0);
  expect(await engineSelection(page)).toMatchObject({ count: 1, type: 'Note' });
});

test('blank paper with nothing selected opens the page menu, and not the browser’s', async ({ page }) => {
  await open(page);
  await runCommand(page, 'edit.deselect').catch(() => undefined);
  const paper = await blankPaper(page);
  const prevented = page.evaluate(
    () =>
      new Promise<boolean>((resolve) =>
        window.addEventListener('contextmenu', (event) => resolve(event.defaultPrevented), { once: true }),
      ),
  );
  await page.mouse.click(paper.x, paper.y, { button: 'right' });
  expect(await prevented).toBe(true);
  await expect(menu(page)).toBeVisible();
  for (const id of ['format.style', 'format.pageSettings', 'format.loadStyle']) {
    await expect(page.getByTestId(`context-item-${id}`)).toBeVisible();
  }
});

test('Shift+F10 opens the menu at the selection', async ({ page }) => {
  await open(page);
  const note = await noteCentre(page, 2);
  await page.mouse.click(note.x, note.y);
  await expect.poll(async () => (await engineSelection(page)).type).toBe('Note');

  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  // The score may finish its fit-width transition after the initial click. Compare
  // the menu with the selected note's current position, not the old click point.
  await expect.poll(async () => {
    const [box, currentNote] = await Promise.all([
      menu(page).boundingBox(),
      page.locator('svg .Note').nth(2).boundingBox(),
    ]);
    return box && currentNote ? Math.abs(box.x - (currentNote.x + currentNote.width / 2)) : Infinity;
  }, { timeout: 10_000 }).toBeLessThan(60);
  await expect(page.getByTestId('context-item-edit.copy')).toBeVisible();
});

test('in note input, a right-click opens no menu', async ({ page }) => {
  await open(page);
  const note = await noteCentre(page, 0);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.noteInput');
  // The command resolves before the editor's note-input state is set.
  await expect(page.locator('button', { hasText: 'Stop input' })).toBeVisible();
  const space = await barSpace(page, 1);
  await page.mouse.click(space.x, space.y, { button: 'right' });
  await page.waitForTimeout(500);
  await expect(menu(page)).toHaveCount(0);
});

test('Swap with Clipboard pastes over the selection and keeps what it replaced', async ({ page }) => {
  await open(page);
  const bar = async (n: number) => {
    const space = await barSpace(page, n);
    await page.mouse.click(space.x, space.y);
    await expect.poll(async () => (await engineSelection(page)).range).toBe(true);
  };

  await bar(0);
  await runCommand(page, 'edit.copy');
  await bar(2);
  const space = await barSpace(page, 2);
  await page.mouse.click(space.x, space.y, { button: 'right' });
  await page.getByTestId('context-item-edit.swapClipboard').click();
  await expect.poll(() => readPitches(page), { timeout: 20_000 }).toEqual(['F4', 'A4', 'F4', 'E5']);

  // The clipboard now holds the C5 that was replaced.
  await bar(1);
  await runCommand(page, 'edit.paste');
  await expect.poll(() => readPitches(page), { timeout: 20_000 }).toEqual(['F4', 'C5', 'F4', 'E5']);
});

// ── Phase 2: the engine's hit report and Select ▸ Similar ─────────────────────────────

/** Opens Select ▸ and picks an entry. */
async function selectSubmenu(page: Page, testId: string) {
  await page.getByTestId('context-sub-select').click();
  await page.getByTestId(testId).click();
  await expect(menu(page)).toHaveCount(0);
}

test('Select ▸ Similar selects every note in the score', async ({ page }) => {
  await open(page);
  const note = await noteCentre(page, 1);
  await page.mouse.click(note.x, note.y, { button: 'right' });
  await selectSubmenu(page, 'context-item-edit.select.similar-similar');
  await expect.poll(() => engineSelection(page)).toMatchObject({ range: false, count: 4, type: 'Note' });
  await expect(page.locator('svg .Note.selected')).toHaveCount(4);
});

test('Similar on This Staff stays on the clicked staff; Similar takes both', async ({ page }) => {
  await page.goto('/?score=/test_scores/two_staves_four_bars.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const note = await noteCentre(page, 0);

  await page.mouse.click(note.x, note.y, { button: 'right' });
  await selectSubmenu(page, 'context-item-edit.select.similarStaff-similar-on-this-staff');
  await expect.poll(async () => (await engineSelection(page)).count).toBe(4);

  // A right-click on a member of that list keeps the list, and MuseScore then offers only
  // Select ▸ More… (not in OTS yet), so single-select the note first, as a user would.
  await page.mouse.click(note.x, note.y);
  await expect.poll(async () => (await engineSelection(page)).count).toBe(1);
  await page.mouse.click(note.x, note.y, { button: 'right' });
  await selectSubmenu(page, 'context-item-edit.select.similar-similar');
  await expect.poll(async () => (await engineSelection(page)).count).toBe(8);
});

test('Similar in This Range selects only inside the range, patterned on the clicked note', async ({ page }) => {
  await open(page);
  const first = await barSpace(page, 0);
  const second = await barSpace(page, 1);
  await page.mouse.click(first.x, first.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(second.x, second.y);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await engineSelection(page)).range).toBe(true);

  const note = await noteCentre(page, 1);
  await page.mouse.click(note.x, note.y, { button: 'right' });
  await selectSubmenu(page, 'context-item-edit.select.similarRange-similar-in-this-range');
  await expect.poll(() => engineSelection(page)).toMatchObject({ range: false, count: 2, type: 'Note' });
});

test('a clef’s menu has no Edit Element: the engine says a clef is not editable', async ({ page }) => {
  await open(page);
  const clef = await page.locator('svg .Clef').first().boundingBox();
  if (!clef) throw new Error('no clef');
  await page.mouse.click(clef.x + clef.width / 2, clef.y + clef.height / 2, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect.poll(async () => (await engineSelection(page)).type).toBe('Clef');
  await expect(page.getByTestId('context-item-edit.copy')).toBeVisible();
  await expect(page.getByTestId('context-item-edit.element')).toHaveCount(0);
});

test('Edit Element on the title frame, away from its text, gives its height handle, which resizes it', async ({ page }) => {
  await page.goto('/?score=/test_scores/eight_bars_one_voice.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const frameHeight = () =>
    page.evaluate(async () => {
      const w = window as unknown as { __webmscore: { getElementPropertyValues(n: string[]): Promise<Record<string, { value: string }>> } };
      return Number((await w.__webmscore.getElementPropertyValues(['height'])).height?.value);
    });

  // The frame's left side, clear of the centred title: the frame's own menu.
  const title = await page.locator('svg .Text').first().boundingBox();
  const score = await page.locator('svg').first().boundingBox();
  if (!title || !score) throw new Error('no title');
  const point = { x: score.x + 40, y: title.y + title.height / 2 };
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect.poll(async () => (await engineSelection(page)).type).toBe('VBox');
  const before = await frameHeight();
  await page.getByTestId('context-item-edit.element').click();

  const grip = page.getByTestId('spanner-grip-0');
  await expect(grip).toBeVisible();
  const box = await grip.boundingBox();
  if (!box) throw new Error('no grip');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  await expect.poll(frameHeight).toBeGreaterThan(before);
});
