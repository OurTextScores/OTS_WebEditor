import { expect, test } from 'playwright/test';
import { runCommand } from './helpers/commands';

const loadSlur = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page
    .getByTestId('open-score-input')
    .setInputFiles('public/test_scores/three_notes_slur.musicxml');
  await page.locator('svg .SlurSegment').first().waitFor({ timeout: 60_000 });
  await expect(page.getByTestId('btn-note-input')).toBeEnabled({ timeout: 60_000 });
  // Upload completion schedules fit/layout work on animation frames. Let the
  // score transform settle before deriving exact SVG geometry coordinates.
  await page.waitForTimeout(500);
};

const loadNotesAndAddHairpin = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page
    .getByTestId('open-score-input')
    .setInputFiles('public/test_scores/three_notes_cde.musicxml');
  const notes = page.locator('svg .Note');
  await notes.first().waitFor({ timeout: 60_000 });
  await expect(page.getByTestId('btn-note-input')).toBeEnabled({ timeout: 60_000 });
  await notes.nth(0).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  const rightmost = await notes.evaluateAll((elements) =>
    elements.reduce(
      (best, element) => {
        const rect = element.getBoundingClientRect();
        const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        return !best || point.x > best.x ? point : best;
      },
      null as { x: number; y: number } | null,
    ),
  );
  expect(rightmost).not.toBeNull();
  await page.keyboard.down('Control');
  await page.mouse.click(rightmost!.x, rightmost!.y);
  await page.keyboard.up('Control');
  // A hairpin spans the selection, so the ctrl-click has to have extended it first. A menu
  // click used to leave time for that; a command runs the instant it is enabled.
  await expect(page.locator('[data-testid^="selection-overlay-"]')).toHaveCount(2);
  // The drag below was built around the decrescendo's geometry. Until the ribbon's glyph
  // overflow was fixed, clicking its "cresc" item silently added a decrescendo, so this is
  // what every run of the old test actually exercised.
  await runCommand(page, 'btn-hairpin-decresc');
  await page.locator('svg .HairpinSegment').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
};

const doubleClickGeometry = async (page: import('@playwright/test').Page, selector: string) => {
  const geometry = page.locator(selector).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const point = await geometry.evaluate((element: SVGGeometryElement) => {
      const local = element.getPointAtLength(element.getTotalLength() * 0.25);
      const matrix = element.getScreenCTM();
      if (!matrix) {
        throw new Error('Spanner path has no screen transform');
      }
      const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    });
    await geometry.dispatchEvent('dblclick', {
      bubbles: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
    });
    await page.waitForTimeout(150);
    if (await page.locator('[data-testid^="spanner-grip-"]').count()) {
      return;
    }
  }
};

const doubleClickSlur = (page: import('@playwright/test').Page) =>
  doubleClickGeometry(page, 'svg path.SlurSegment');

const readSlurPath = (page: import('@playwright/test').Page): Promise<string | null> =>
  page.locator('svg .SlurSegment').first().getAttribute('d');

test('double-clicking a slur exposes native grips and Escape exits edit mode', async ({ page }) => {
  await loadSlur(page);

  await doubleClickSlur(page);
  await expect(page.getByTestId('spanner-grip-2')).toBeVisible();
  const visibleGripBox = await page.getByTestId('spanner-grip-2').boundingBox();
  // 16px, give or take the sub-pixel position the layout above it leaves the grip at.
  expect(visibleGripBox?.width).toBeGreaterThanOrEqual(15.9);
  expect(visibleGripBox?.height).toBeGreaterThanOrEqual(15.9);
  await expect(page.getByTestId('spanner-grip-0')).toBeDisabled();
  await expect(page.getByTestId('spanner-grip-1')).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('spanner-grip-2')).toHaveCount(0);
});

test('dragging a slur shape grip commits one undoable reshape', async ({ page }) => {
  await loadSlur(page);
  const pathBefore = await readSlurPath(page);
  expect(pathBefore).not.toBeNull();

  await doubleClickSlur(page);
  const grip = page.getByTestId('spanner-grip-2');
  await expect(grip).toBeVisible();
  const box = await grip.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 20, box!.y + box!.height / 2 - 16, { steps: 4 });
  await page.mouse.up();

  await expect
    .poll(async () => (await readSlurPath(page)) !== pathBefore, { timeout: 20_000 })
    .toBe(true);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await readSlurPath(page)) === pathBefore, { timeout: 20_000 })
    .toBe(true);
});

test('dragging a hairpin endpoint extends the line', async ({ page }) => {
  await loadNotesAndAddHairpin(page);
  const hairpin = page.locator('svg .HairpinSegment').first();
  await expect(hairpin).toBeVisible();
  const pointsBefore = await hairpin.getAttribute('points');

  await doubleClickGeometry(page, 'svg .HairpinSegment');
  const grip = page.getByTestId('spanner-grip-1');
  await expect(grip).toBeEnabled();
  const box = await grip.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 24, box!.y + box!.height / 2, { steps: 4 });
  await page.mouse.up();

  await expect
    .poll(async () => await page.locator('svg .HairpinSegment').first().getAttribute('points'))
    .not.toBe(pointsBefore);
});
