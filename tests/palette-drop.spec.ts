import { expect, test, type Page } from 'playwright/test';
import { waitForCommandEnabled } from './helpers/commands';

test.use({ viewport: { width: 2400, height: 1600 } });

const loadSingleNoteScore = async (page: Page) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await waitForCommandEnabled(page, 'edit.undo');
};

const saveXml = (page: Page) =>
  page.evaluate(async () => {
    const scoreWindow = window as unknown as { __webmscore?: { saveXml?: () => Promise<string> } };
    if (!scoreWindow.__webmscore?.saveXml) throw new Error('saveXml is unavailable');
    return scoreWindow.__webmscore.saveXml();
  });

/** The docked palettes, filtered to what the test drags. */
const search = (page: Page, query: string) => page.getByTestId('palette-search').fill(query);

test('dragging a dynamic directly from Dynamics applies it as one undoable command', async ({
  page,
}) => {
  await loadSingleNoteScore(page);

  await search(page, 'mf');
  await page
    .locator('[data-testid^="palette-item-dynamic-"]')
    .first()
    .dragTo(page.locator('svg .Note').first());
  await expect(page.locator('svg .Dynamic')).toHaveCount(1, { timeout: 20_000 });

  await page.keyboard.press('Control+z');
  await expect(page.locator('svg .Dynamic')).toHaveCount(0, { timeout: 20_000 });
});

test('dragging a clef directly from Clef applies it at the target measure', async ({ page }) => {
  await loadSingleNoteScore(page);

  await page.getByTestId('palette-item-clef-20').dragTo(page.locator('svg .Note').first());
  await expect
    .poll(async () => (await saveXml(page)).includes('<sign>F</sign>'), { timeout: 20_000 })
    .toBe(true);
});

test('dragging directly from Articulations applies without a prior selection', async ({ page }) => {
  await loadSingleNoteScore(page);

  await search(page, 'tenuto');
  await page
    .locator('[data-testid^="palette-item-articulation-"]')
    .first()
    .dragTo(page.locator('svg .Note').first());
  await expect(page.locator('svg .Articulation')).toHaveCount(1, { timeout: 20_000 });
});
