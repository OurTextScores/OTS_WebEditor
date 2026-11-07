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
  await p.getByTestId('performer-open-editor').click();
  const editor = await opening;
  await expect(editor.locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
  const editorDynamicsBefore = await editor.locator('svg .Dynamic').count();
  await expect(editor.getByTestId('marks-review-notice')).toHaveText(
    '2 rehearsal marks to review',
    {
      timeout: 30_000,
    },
  );
  await editor.getByTestId('marks-review-notice').click();
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
});
