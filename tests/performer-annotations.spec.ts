import { expect, test, type Page } from './helpers/diagnostic-test';

// Performer mode, Phase 4: annotations drawn over the score, anchored to the music, kept on the device.

test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

const SCORE = '/test_scores/bach_orig.mscz';
const page = (p: Page) => p.getByTestId('performer-page-svg');
const marks = (p: Page) => p.getByTestId('annotation-layer').locator('[data-annotation]');

async function open(p: Page) {
  await p.goto(`/perform?score=${encodeURIComponent(SCORE)}`);
  await expect(page(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
}

async function openControls(p: Page) {
  const box = (await p.getByTestId('performer-surface').boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.move(box.x + box.width / 2, box.y + 10);
  await p.mouse.down();
  await p.waitForTimeout(800);
  await p.mouse.up();
  await expect(p.getByTestId('performer-bar')).toBeVisible();
}

async function startAnnotating(p: Page) {
  await openControls(p);
  await p.getByTestId('performer-annotate').click();
  await expect(p.getByTestId('annotate-tools')).toBeVisible();
}

const centre = async (locator: ReturnType<Page['locator']>) => {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/**
 * Where a stamp or text mark was put, on screen: its data-center (the point it was placed at, page units) through the
 * overlay's transform. (A glyph's own box depends on the font; the point does not.)
 */
const markAt = (locator: ReturnType<Page['locator']>) =>
  locator.evaluate((element) => {
    const svg = (element as SVGTextElement).ownerSVGElement!;
    const [x, y] = (element.getAttribute('data-center') ?? '0 0').split(' ').map(Number);
    const point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });

test('draws, stamps and writes on the score, undoes, erases, and keeps the marks', async ({
  page: p,
}) => {
  await open(p);
  await startAnnotating(p);

  // A pen stroke, starting on the music (a mark is anchored to the bar it starts in)
  const note = page(p).locator('svg .Note').nth(30);
  const at = await centre(note);
  await p.mouse.move(at.x, at.y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i += 1) await p.mouse.move(at.x + i * 15, at.y + (i % 2) * 6);
  await p.mouse.up();
  await expect(marks(p)).toHaveCount(1);

  // A fingering stamp above a note: it lands where it was put
  await p.getByTestId('annotate-stamp').click();
  await p.getByTestId('annotate-stamp-fingering4').click();
  const stampAt = await centre(page(p).locator('svg .Note').nth(5));
  await p.mouse.click(stampAt.x, stampAt.y - 25);
  const stamp = p.getByTestId('annotation-layer').locator('[data-stamp="fingering4"]');
  await expect(stamp).toHaveCount(1);
  const placed = await markAt(stamp);
  expect(Math.abs(placed.x - stampAt.x)).toBeLessThan(20);
  expect(Math.abs(placed.y - (stampAt.y - 25))).toBeLessThan(20);

  // Text
  await p.getByTestId('annotate-text').click();
  await p.mouse.click(stampAt.x + 80, stampAt.y - 40);
  await p.getByTestId('annotate-text-input').fill('breathe');
  await p.getByTestId('annotate-text-input').press('Enter');
  await expect(
    p.getByTestId('annotation-layer').locator('text', { hasText: 'breathe' }),
  ).toHaveCount(1);
  await expect(marks(p)).toHaveCount(3);

  // Undo the text, then erase the stroke
  await p.getByTestId('annotate-undo').click();
  await expect(marks(p)).toHaveCount(2);
  await p.getByTestId('annotate-eraser').click();
  await p.mouse.click(at.x + 4 * 15, at.y);
  await expect(marks(p)).toHaveCount(1);

  // Kept on the device: after a reload the stamp is back
  await p.getByTestId('annotate-done').click();
  await p.reload();
  await expect(page(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
  await expect(p.getByTestId('annotation-layer').locator('[data-stamp="fingering4"]')).toHaveCount(
    1,
    {
      timeout: 30_000,
    },
  );
});

test('a stamp stays on its note when the music is laid out again larger', async ({ page: p }) => {
  await open(p);
  await startAnnotating(p);
  await p.getByTestId('annotate-stamp').click();
  await p.getByTestId('annotate-stamp-fingering2').click();
  const firstAt = await centre(page(p).locator('svg .Note').first());
  await p.mouse.click(firstAt.x, firstAt.y - 20);
  const stamp = p.getByTestId('annotation-layer').locator('[data-stamp="fingering2"]');
  await expect(stamp).toHaveCount(1);
  await p.getByTestId('annotate-done').click();

  await openControls(p);
  for (let i = 0; i < 3; i += 1) await p.getByTestId('performer-larger').click();
  await p.getByTestId('performer-done').click();
  // The first note moved and grew; the stamp moved with it
  await expect
    .poll(
      async () => {
        if ((await stamp.count()) !== 1) return false;
        const noteAt = await centre(page(p).locator('svg .Note').first());
        const mark = await markAt(stamp);
        return Math.abs(mark.x - noteAt.x) < 25 && mark.y < noteAt.y && noteAt.y - mark.y < 60;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

test('in Play-through a mark shows at each repeat; erasing one asks all or only this one', async ({
  page: p,
}) => {
  // Played 1, 2, 1, 3: bar 1 is written out twice
  await p.goto(`/perform?score=${encodeURIComponent('/test_scores/lyrics_repeat_volta.musicxml')}`);
  await expect(page(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
  const writtenNotes = await page(p).locator('svg .Note').count();
  await openControls(p);
  await p.getByTestId('performer-play-through').check();
  await p.getByTestId('performer-done').click();
  await expect
    .poll(() => page(p).locator('svg .Note').count(), { timeout: 60_000 })
    .toBeGreaterThan(writtenNotes);

  await startAnnotating(p);
  await p.getByTestId('annotate-stamp').click();
  await p.getByTestId('annotate-stamp-fingering3').click();
  const firstAt = await centre(page(p).locator('svg .Note').first());
  await p.mouse.click(firstAt.x, firstAt.y - 20);
  const stamps = p.getByTestId('annotation-layer').locator('[data-stamp="fingering3"]');
  await expect(stamps).toHaveCount(2);

  // Erase the second play's copy: asked, and only that one goes
  await p.getByTestId('annotate-eraser').click();
  const second = await markAt(stamps.nth(1));
  await p.mouse.click(second.x, second.y);
  await expect(p.getByTestId('erase-scope')).toBeVisible();
  await p.getByTestId('erase-only-here').click();
  await expect(stamps).toHaveCount(1);
  const left = await markAt(stamps.first());
  expect(Math.abs(left.x - firstAt.x)).toBeLessThan(20);

  // The last copy: nothing to ask, it goes
  await p.mouse.click(left.x, left.y);
  await expect(p.getByTestId('erase-scope')).toHaveCount(0);
  await expect(stamps).toHaveCount(0);
  await p.getByTestId('annotate-undo').click();
  await expect(stamps).toHaveCount(1);
});

test('marks can be backed up to a file and restored from it', async ({ page: p }) => {
  await open(p);
  await startAnnotating(p);
  await p.getByTestId('annotate-stamp').click();
  await p.getByTestId('annotate-stamp-fingering5').click();
  const firstAt = await centre(page(p).locator('svg .Note').first());
  await p.mouse.click(firstAt.x, firstAt.y - 20);
  const stamp = p.getByTestId('annotation-layer').locator('[data-stamp="fingering5"]');
  await expect(stamp).toHaveCount(1);
  await p.getByTestId('annotate-done').click();

  await openControls(p);
  const downloading = p.waitForEvent('download');
  await p.getByTestId('marks-backup').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^ots-perform-marks-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  await expect(p.getByTestId('marks-note')).toContainText('Backed up 1 mark');
  await p.getByTestId('performer-done').click();

  // Erased here; the backup brings it back
  await startAnnotating(p);
  await p.getByTestId('annotate-eraser').click();
  const at = await markAt(stamp);
  await p.mouse.click(at.x, at.y);
  await expect(stamp).toHaveCount(0);
  await p.getByTestId('annotate-done').click();

  await openControls(p);
  await p.getByTestId('marks-restore-file').setInputFiles(file);
  await expect(p.getByTestId('marks-note')).toContainText('Restored 1 mark');
  await p.getByTestId('performer-done').click();
  await expect(stamp).toHaveCount(1);
});

test('stamps are engraved glyphs from the music font, centred where they are put', async ({
  page: p,
}) => {
  await open(p);
  await startAnnotating(p);
  await p.getByTestId('annotate-stamp').click();
  // The palette shows the glyphs themselves
  await expect(p.getByTestId('annotate-stamps').getByRole('radio', { name: 'mf' })).toBeVisible();
  await p.getByTestId('annotate-stamp-dynamicMF').click();
  const below = await centre(page(p).locator('svg .Note').nth(3));
  const at = { x: below.x, y: below.y + 60 };
  await p.mouse.click(at.x, at.y);
  const mf = p.getByTestId('annotation-layer').locator('[data-stamp="dynamicMF"]');
  await expect(mf).toHaveCount(1);
  await expect(mf).toHaveText('');
  expect(await p.evaluate(() => document.fonts.check('16px PerformMusic', ''))).toBe(true);
  await p.evaluate(() => document.fonts.ready);
  // The glyph's ink, as this browser's font draws it (canvas measureText on the same font), is centred on the tap.
  // (An SVG text's box is the glyph's ink in Chromium but the font's line box in WebKit, so it is not used.)
  const ink = await mf.evaluate((element) => {
    const text = element as SVGTextElement;
    const size = Number(text.getAttribute('font-size'));
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = `${size}px PerformMusic`;
    const metrics = context.measureText(text.textContent ?? '');
    const x =
      Number(text.getAttribute('x')) +
      (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2;
    const y =
      Number(text.getAttribute('y')) -
      (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    const point = new DOMPoint(x, y).matrixTransform(text.ownerSVGElement!.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  expect(Math.abs(ink.x - at.x)).toBeLessThan(3);
  expect(Math.abs(ink.y - at.y)).toBeLessThan(3);
  // Shown in the screenshot of the tools, for a look: test-results/
  await p.screenshot({ path: test.info().outputPath('stamps.png') });
});

test('undo and redo with the editor keys, and the history goes back to any step', async ({
  page: p,
}) => {
  await open(p);
  await startAnnotating(p);
  await p.getByTestId('annotate-stamp').click();
  await p.getByTestId('annotate-stamp-dynamicPiano').click();
  const first = await centre(page(p).locator('svg .Note').nth(3));
  await p.mouse.click(first.x, first.y + 60);
  await p.getByTestId('annotate-stamp-dynamicForte').click();
  const second = await centre(page(p).locator('svg .Note').nth(12));
  await p.mouse.click(second.x, second.y + 60);
  await expect(marks(p)).toHaveCount(2);

  await p.keyboard.press('ControlOrMeta+z');
  await expect(marks(p)).toHaveCount(1);
  await p.keyboard.press('ControlOrMeta+Shift+z');
  await expect(marks(p)).toHaveCount(2);

  // The history: newest first, then the marks as opened
  await p.getByTestId('annotate-history').click();
  const panel = p.getByTestId('annotate-history-panel');
  await expect(panel.locator('[data-edit-row]')).toHaveText([
    /Stamp f, bar \d+/,
    /Stamp p, bar \d+/,
    'Original',
  ]);
  await panel.getByText('Original').click();
  await expect(marks(p)).toHaveCount(0);
  await panel.getByText(/Stamp f/).click();
  await expect(marks(p)).toHaveCount(2);
});
