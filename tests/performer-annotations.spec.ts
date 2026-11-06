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
 * Where a text mark (stamp or text) is anchored on screen: its x/y through the overlay's transform. (WebKit reports an
 * SVG text's bounding box differently from Chromium; the anchor point is the same in both.)
 */
const markAt = (locator: ReturnType<Page['locator']>) =>
  locator.evaluate((element) => {
    const svg = (element as SVGTextElement).ownerSVGElement!;
    const at = new DOMPoint(Number(element.getAttribute('x')), Number(element.getAttribute('y')));
    const point = at.matrixTransform(svg.getScreenCTM()!);
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
  await p.getByTestId('annotate-stamp-choice').selectOption('4');
  const stampAt = await centre(page(p).locator('svg .Note').nth(5));
  await p.mouse.click(stampAt.x, stampAt.y - 25);
  const stamp = p.getByTestId('annotation-layer').locator('text', { hasText: '4' });
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
  await expect(p.getByTestId('annotation-layer').locator('text', { hasText: '4' })).toHaveCount(1, {
    timeout: 30_000,
  });
});

test('a stamp stays on its note when the music is laid out again larger', async ({ page: p }) => {
  await open(p);
  await startAnnotating(p);
  await p.getByTestId('annotate-stamp').click();
  await p.getByTestId('annotate-stamp-choice').selectOption('2');
  const firstAt = await centre(page(p).locator('svg .Note').first());
  await p.mouse.click(firstAt.x, firstAt.y - 20);
  const stamp = p.getByTestId('annotation-layer').locator('text', { hasText: '2' });
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
  await p.getByTestId('annotate-stamp-choice').selectOption('3');
  const firstAt = await centre(page(p).locator('svg .Note').first());
  await p.mouse.click(firstAt.x, firstAt.y - 20);
  const stamps = p.getByTestId('annotation-layer').locator('text', { hasText: '3' });
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
  await p.getByTestId('annotate-stamp-choice').selectOption('5');
  const firstAt = await centre(page(p).locator('svg .Note').first());
  await p.mouse.click(firstAt.x, firstAt.y - 20);
  const stamp = p.getByTestId('annotation-layer').locator('text', { hasText: '5' });
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
