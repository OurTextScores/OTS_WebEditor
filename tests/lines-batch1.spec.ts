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

const reloadCurrentMscx = async (page: Page) => {
  const bytes = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { saveMsc?: (format: 'mscx') => Promise<Uint8Array> };
      }
    ).__webmscore;
    if (!score?.saveMsc) throw new Error('window.__webmscore.saveMsc is unavailable');
    return Array.from(await score.saveMsc('mscx'));
  });
  await page.getByTestId('open-score-input').setInputFiles({
    name: 'batch1-roundtrip.mscx',
    mimeType: 'application/vnd.musescore',
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByTestId('btn-note-input')).toBeEnabled({ timeout: 60_000 });
};

const loadTwoNotes = async (page: Page) => {
  await page.goto('/?score=/test_scores/two_notes_cc.musicxml');
  const notes = page.locator('svg .Note');
  await notes.first().waitFor({ timeout: 60_000 });
  await expect(page.getByTestId('btn-note-input')).toBeEnabled({ timeout: 20_000 });
  return notes;
};

const selectAllNotes = async (page: Page) => {
  await page.keyboard.press('Control+a');
  await waitForCommandEnabled(page, 'btn-trill-3');
};

const doubleClickGeometry = async (page: Page, selector: string) => {
  const geometry = page.locator(selector).first();
  const point = await geometry.evaluate((element: SVGGeometryElement) => {
    const local = element.getPointAtLength(element.getTotalLength() * 0.35);
    const matrix = element.getScreenCTM();
    if (!matrix) throw new Error('Line has no screen transform');
    const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  });
  await geometry.dispatchEvent('dblclick', {
    bubbles: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
  });
};

test('adds an undoable 8va line that supports native grip editing', async ({ page }) => {
  await loadTwoNotes(page);
  await selectAllNotes(page);
  await runCommand(page, 'btn-ottava-0');
  await expect(page.locator('svg .OttavaSegment').first()).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await readMscx(page)).includes('<Ottava>'), { timeout: 20_000 })
    .toBe(true);

  await doubleClickGeometry(page, 'svg path.OttavaSegment');
  await expect(page.locator('[data-testid^="spanner-grip-"]').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+z');
  await expect(page.locator('svg .OttavaSegment')).toHaveCount(0, { timeout: 20_000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('svg .OttavaSegment').first()).toBeVisible({ timeout: 20_000 });
  await reloadCurrentMscx(page);
  await expect(page.locator('svg .OttavaSegment').first()).toBeVisible({ timeout: 20_000 });
});

test('adds and serializes a non-default trill line', async ({ page }) => {
  await loadTwoNotes(page);
  await selectAllNotes(page);
  await runCommand(page, 'btn-trill-3');
  await expect(page.locator('svg .TrillSegment').first()).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => /<Trill>[\s\S]*?<subtype>prallprall<\/subtype>/.test(await readMscx(page)), {
      timeout: 20_000,
    })
    .toBe(true);
  await page.keyboard.press('Control+z');
  await expect(page.locator('svg .TrillSegment')).toHaveCount(0, { timeout: 20_000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('svg .TrillSegment').first()).toBeVisible({ timeout: 20_000 });
  await reloadCurrentMscx(page);
  await expect(page.locator('svg .TrillSegment').first()).toBeVisible({ timeout: 20_000 });
});

test('adds a wavy glissando between exactly two selected notes', async ({ page }) => {
  await loadTwoNotes(page);
  await selectAllNotes(page);
  await runCommand(page, 'btn-glissando-1');
  await expect(page.locator('svg .GlissandoSegment').first()).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => /<Glissando>[\s\S]*?<subtype>1<\/subtype>/.test(await readMscx(page)), {
      timeout: 20_000,
    })
    .toBe(true);
  await page.keyboard.press('Control+z');
  await expect(page.locator('svg .GlissandoSegment')).toHaveCount(0, { timeout: 20_000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('svg .GlissandoSegment').first()).toBeVisible({ timeout: 20_000 });
  await reloadCurrentMscx(page);
  await expect(page.locator('svg .GlissandoSegment').first()).toBeVisible({ timeout: 20_000 });
});

test('rejects a glissando when only one note is selected', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  const notes = page.locator('svg .Note');
  await notes.first().waitFor({ timeout: 60_000 });
  await expect(page.getByTestId('btn-note-input')).toBeEnabled({ timeout: 20_000 });
  await notes.first().click();

  const result = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { addGlissando?: (type: number) => Promise<boolean> };
      }
    ).__webmscore;
    if (!score?.addGlissando) throw new Error('window.__webmscore.addGlissando is unavailable');
    return score.addGlissando(0);
  });
  expect(result).toBe(false);
  expect((await readMscx(page)).includes('<Glissando>')).toBe(false);
});
