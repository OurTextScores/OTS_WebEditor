import { runCommand } from './helpers/commands';
import { expect, test, type Page } from './helpers/diagnostic-test';

// Performer mode, Phase 7a: stamps made in performer mode are reviewed in the editor and engraved; performer mode then
// shows the engraved notation instead of the stamp. Undo engraving puts everything back.

test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

const SCORE = '/test_scores/bach_orig.mscz';
const pageSvg = (p: Page) => p.getByTestId('performer-page-svg');
const stampOf = (p: Page, id: string) =>
  p.getByTestId('annotation-layer').locator(`[data-stamp="${id}"]`);

async function openPerformer(p: Page) {
  await p.goto(`/perform?score=${encodeURIComponent(SCORE)}`);
  await expect(pageSvg(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
}

async function stampAt(p: Page, id: string, noteIndex: number, dy: number) {
  const box = (await pageSvg(p).locator('svg .Note').nth(noteIndex).boundingBox())!;
  await p.getByTestId(`annotate-stamp-${id}`).click();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + dy);
  await expect(stampOf(p, id)).toHaveCount(1);
}

test('stamps reviewed in the editor become notation, and performer mode shows the notation', async ({
  page: p,
  context,
}) => {
  test.setTimeout(240_000);
  await openPerformer(p);
  const dynamicsBefore = await pageSvg(p).locator('svg .Dynamic').count();
  // Long press near the top for the controls, then Annotate
  const surface = (await p.getByTestId('performer-surface').boundingBox())!;
  await p.mouse.move(surface.x + surface.width / 2, surface.y + 10);
  await p.mouse.down();
  await p.waitForTimeout(800);
  await p.mouse.up();
  await p.getByTestId('performer-annotate').click();
  await p.getByTestId('annotate-stamp').click();
  await stampAt(p, 'dynamicMF', 3, 60);
  await stampAt(p, 'watch', 12, -40);
  await p.getByTestId('annotate-done').click();

  // Open in Editor: the marks wait for review
  await p.keyboard.press('Escape');
  const opening = context.waitForEvent('page');
  await expect(p.getByTestId('performer-open-editor')).toHaveText('Review 2 marks in editor');
  await p.getByTestId('performer-open-editor').click();
  const editor = await opening;
  await expect(editor.locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
  const editorDynamicsBefore = await editor.locator('svg .Dynamic').count();
  // Opened to review: the review is already open
  const review = editor.getByTestId('marks-review');
  await expect(review.getByTestId('marks-review-item')).toHaveCount(2);
  const watch = review.getByTestId('marks-review-item').filter({ hasText: 'Watch' });
  await expect(watch.getByRole('radio', { name: 'Engrave' })).toBeDisabled();
  await expect(watch.getByRole('radio', { name: 'Keep as mark' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await review.getByTestId('marks-review-engrave').click();
  await expect(review.getByTestId('marks-review-outcome')).toContainText('Engraved 1', {
    timeout: 30_000,
  });
  await expect
    .poll(() => editor.locator('svg .Dynamic').count(), { timeout: 30_000 })
    .toBe(editorDynamicsBefore + 1);

  // Undo engraving: the notation goes and both marks wait again
  await review.getByTestId('marks-review-undo').click();
  await expect
    .poll(() => editor.locator('svg .Dynamic').count(), { timeout: 30_000 })
    .toBe(editorDynamicsBefore);
  await expect(review.getByTestId('marks-review-item')).toHaveCount(2);
  await expect(review.getByTestId('marks-review-outcome')).toHaveCount(0);

  // Engraved again, for performer mode. (Reloading performer mode comes last: the dev server reloads every open page
  // when it recompiles a route, which would reload the editor.)
  await review.getByTestId('marks-review-engrave').click();
  await expect(review.getByTestId('marks-review-outcome')).toContainText('Engraved 1', {
    timeout: 30_000,
  });

  // Performer mode: the engraved dynamic, no mf stamp; the reminder is still a mark
  await p.bringToFront();
  await p.reload();
  await expect(pageSvg(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
  await expect
    .poll(() => pageSvg(p).locator('svg .Dynamic').count(), { timeout: 30_000 })
    .toBe(dynamicsBefore + 1);
  await expect(stampOf(p, 'dynamicMF')).toHaveCount(0);
  await expect(stampOf(p, 'watch')).toHaveCount(1);
  // Reviewed: nothing waits now (the reminder was kept)
  await p.keyboard.press('Escape');
  await expect(p.getByTestId('performer-open-editor')).toHaveText('Open in Editor');
});

test('a mark finds its bar again after bars are inserted before it', async ({
  page: p,
  context,
}) => {
  test.setTimeout(240_000);
  await p.goto(`/perform?score=${encodeURIComponent('/test_scores/four_measures.musicxml')}`);
  await expect(pageSvg(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
  const surface = (await p.getByTestId('performer-surface').boundingBox())!;
  await p.mouse.move(surface.x + surface.width / 2, surface.y + 10);
  await p.mouse.down();
  await p.waitForTimeout(800);
  await p.mouse.up();
  await p.getByTestId('performer-annotate').click();
  await p.getByTestId('annotate-stamp').click();
  // Under the last note: bar 4
  await stampAt(p, 'dynamicMF', (await pageSvg(p).locator('svg .Note').count()) - 1, 60);
  await p.getByTestId('annotate-done').click();
  await p.keyboard.press('Escape');
  const opening = context.waitForEvent('page');
  await p.getByTestId('performer-open-editor').click();
  const editor = await opening;
  await expect(editor.getByTestId('marks-review')).toBeVisible({ timeout: 60_000 });
  await editor.keyboard.press('Escape');

  // Two bars inserted at the beginning, then the review
  await runCommand(editor, 'add.measures', { count: 2, target: 'beginning' });
  await expect.poll(() => barCount(editor), { timeout: 30_000 }).toBe(6);
  await runCommand(editor, 'file.reviewMarks');
  const review = editor.getByTestId('marks-review');
  await review.getByTestId('marks-review-engrave').click();
  await expect(review.getByTestId('marks-review-outcome')).toContainText('Engraved 1', {
    timeout: 30_000,
  });
  // In bar 6 (index 5): where bar 4 went
  expect(await dynamicBars(editor)).toEqual([5]);
});

/** The editor's score as MSCX: the first staff's measures. */
const measuresOf = (editor: Page) =>
  editor.evaluate(async () => {
    const score = (
      window as unknown as { __webmscore?: { saveMsc: (f: string) => Promise<Uint8Array> } }
    ).__webmscore!;
    const xml = new TextDecoder().decode(await score.saveMsc('mscx'));
    const staff = xml.slice(xml.indexOf('<Staff id="1">', xml.indexOf('</Part>')));
    return staff.slice(0, staff.indexOf('</Staff>')).split('<Measure').slice(1);
  });
const barCount = async (editor: Page) => (await measuresOf(editor)).length;
const dynamicBars = async (editor: Page) =>
  (await measuresOf(editor)).flatMap((measure, index) =>
    measure.includes('<Dynamic>') ? [index] : [],
  );

test('a drawn hairpin and known words engrave as notation (no model needed)', async ({ page: p, context }) => {
  test.setTimeout(240_000);
  await openPerformer(p);
  const surface = (await p.getByTestId('performer-surface').boundingBox())!;
  await p.mouse.move(surface.x + surface.width / 2, surface.y + 10);
  await p.mouse.down();
  await p.waitForTimeout(800);
  await p.mouse.up();
  await p.getByTestId('performer-annotate').click();

  // A "<" under notes 2 to 6 of the first system, in one stroke: right-top, left apex, right-bottom
  const from = (await pageSvg(p).locator('svg .Note').nth(2).boundingBox())!;
  const to = (await pageSvg(p).locator('svg .Note').nth(6).boundingBox())!;
  const below = Math.max(from.y, to.y) + 45;
  const corners: [number, number][] = [
    [to.x, below - 8],
    [from.x, below],
    [to.x, below + 8],
  ];
  await p.mouse.move(...corners[0]);
  await p.mouse.down();
  for (let c = 1; c < corners.length; c += 1) {
    for (let s = 1; s <= 10; s += 1) {
      const x = corners[c - 1][0] + ((corners[c][0] - corners[c - 1][0]) * s) / 10;
      const y = corners[c - 1][1] + ((corners[c][1] - corners[c - 1][1]) * s) / 10;
      await p.mouse.move(x, y);
    }
  }
  await p.mouse.up();

  // Two known words
  for (const [index, words, dy] of [
    [9, 'dolce', 45],
    [12, 'pizz.', -30],
  ] as const) {
    await p.getByTestId('annotate-text').click();
    const at = (await pageSvg(p).locator('svg .Note').nth(index).boundingBox())!;
    await p.mouse.click(at.x + at.width / 2, at.y + at.height / 2 + dy);
    await p.getByTestId('annotate-text-input').fill(words);
    await p.getByTestId('annotate-text-input').press('Enter');
  }
  await expect(p.getByTestId('annotation-layer').locator('[data-annotation]')).toHaveCount(3);
  await p.getByTestId('annotate-done').click();

  await p.keyboard.press('Escape');
  const opening = context.waitForEvent('page');
  await p.getByTestId('performer-open-editor').click();
  const editor = await opening;
  const review = editor.getByTestId('marks-review');
  await expect(review).toBeVisible({ timeout: 60_000 });
  const items = review.getByTestId('marks-review-item');
  await expect(items).toHaveCount(3);
  await expect(items.filter({ hasText: 'Crescendo hairpin' })).toHaveCount(1);
  await expect(items.filter({ hasText: 'Expression text “dolce”' })).toHaveCount(1);
  await expect(items.filter({ hasText: 'Technique text “pizz.”' })).toHaveCount(1);
  await review.getByTestId('marks-review-engrave').click();
  await expect(review.getByTestId('marks-review-outcome')).toContainText('Engraved 3', { timeout: 30_000 });

  const engraved = await editor.evaluate(async () => {
    const score = (window as unknown as { __webmscore: { saveMsc: (f: string) => Promise<Uint8Array> } }).__webmscore;
    const xml = new TextDecoder().decode(await score.saveMsc('mscx'));
    return {
      hairpins: (xml.match(/<HairPin>/g) ?? []).length,
      dolce: /<Expression>[\s\S]*?<text>dolce<\/text>/.test(xml),
      pizz: /<StaffText>[\s\S]*?<text>pizz\.<\/text>/.test(xml),
    };
  });
  expect(engraved).toEqual({ hairpins: 1, dolce: true, pizz: true });
});
