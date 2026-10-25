import { expect, test, type Page } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';
import { runCommand } from './helpers/commands';

const cursor = (page: Page) => page.getByTestId('playback-cursor');
const cursorStart = async (page: Page) => Number(await cursor(page).getAttribute('data-start-ms'));
const undoIndex = (page: Page) =>
  page.evaluate(
    async () =>
      (await (window as typeof window & { __webmscore: Score }).__webmscore.getUndoInfo!()).index,
  );

async function startPlayback(page: Page) {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.getByTestId('btn-play').click();
  await expect(cursor(page)).toBeVisible({ timeout: 60_000 });
}

test('the editor cursor follows playback, and a plain note click seeks without selecting', async ({
  page,
}) => {
  await startPlayback(page);
  const undo = await undoIndex(page);
  await expect(cursor(page)).toHaveAttribute('data-kind', 'segment');
  const first = await cursorStart(page);
  await expect.poll(() => cursorStart(page), { timeout: 10_000 }).toBeGreaterThan(first);
  await expect(page.getByTestId('playback-tracking-hint')).toBeVisible();
  await expect(page.getByTestId('playback-tracking-hint')).toHaveText('Click a note to seek');

  const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));
  const before = await cursorStart(page);
  // A note from the last system of the page: well ahead of the playhead.
  await page.locator('svg .Note').last().click();
  await expect(page.getByTestId('playback-seek-marker')).toBeVisible();
  await expect.poll(() => cursorStart(page)).toBeGreaterThan(before + 5_000);
  await expect(page.getByTestId('selection-overlay')).toHaveCount(0);
  expect(await undoIndex(page)).toBe(undo);
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause');
  // Following never moves focus.
  expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))).toBe(focused);

  await page.getByTestId('btn-stop').click();
  await expect(cursor(page)).toHaveCount(0);
  // Stopped: the same click is an ordinary selection again.
  await page.locator('svg .Note').nth(3).click();
  await expect(page.getByTestId('selection-overlay').first()).toBeVisible();
  expect(await undoIndex(page)).toBe(undo);
});

test('following turns pages, manual paging suspends it, and Resume brings playback back', async ({
  page,
}) => {
  await startPlayback(page);
  const pageSelect = page.getByTestId('page-select');
  await expect(pageSelect).toHaveValue('0');
  await page.locator('svg .Note').last().click();
  // The next page with music, from the engine's own map (an engraved score may hold a page without any).
  await expect(pageSelect).not.toHaveValue('0', { timeout: 30_000 });
  const playbackPage = await pageSelect.inputValue();
  await expect(cursor(page)).toBeVisible();

  // Manual navigation supersedes an automatic turn (latest-wins navigation), even during its render.
  await runCommand(page, 'view.goto.prevPage');
  await expect(pageSelect).not.toHaveValue(playbackPage);
  await expect(page.getByTestId('btn-resume-following')).toBeVisible();
  await expect(page.getByTestId('btn-jump-to-playback')).toHaveText(
    `Playing on page ${Number(playbackPage) + 1}`,
  );
  // Suspended: the viewport stays where the user put it while playback continues.
  const manualPage = await pageSelect.inputValue();
  await page.waitForTimeout(1_500);
  await expect(pageSelect).toHaveValue(manualPage);

  await page.getByTestId('btn-resume-following').click();
  await expect(pageSelect).toHaveValue(playbackPage, { timeout: 15_000 });
  await expect(page.getByTestId('btn-resume-following')).toHaveCount(0);

  // The preference persists; turning it off keeps the cursor but stops page motion.
  await page.getByTestId('btn-follow-playback').click();
  await expect(page.getByTestId('btn-follow-playback')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.localStorage.getItem('ots-editor-follow'))).toBe('0');
  await runCommand(page, 'playback.follow');
  await expect(page.getByTestId('btn-follow-playback')).toHaveAttribute('aria-pressed', 'true');
});

test('the cursor starts at a played selection and returns at a written repeat', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const timeline = await page.evaluate(async () => {
    const score = (window as typeof window & { __webmscore: Score }).__webmscore;
    await score.selectPartMeasureByIndex!(0, 1);
    await score.toggleRepeatEnd!();
    return (await score.playbackTimeline!())!.occurrences.map((o) => [o.measureIndex, o.startMs]);
  });
  expect(timeline.map(([measure]) => measure)).toEqual([0, 1, 0, 1, 2, 3]);
  // Select a note of measure 2 the way a user does, on the canvas, then play from it.
  const target = await page.evaluate(async () => {
    const score = (window as typeof window & { __webmscore: Score }).__webmscore;
    const box = (await score.measurePositions()).elements[1];
    const wrapper = document.querySelector('[data-testid="score-wrapper"]') as HTMLElement;
    const rect = wrapper.getBoundingClientRect();
    const zoom = rect.width / wrapper.offsetWidth;
    const left = rect.left + box.x * zoom;
    const right = rect.left + (box.x + box.sx) * zoom;
    const note = [...document.querySelectorAll('svg .Note')]
      .map((element) => element.getBoundingClientRect())
      .find((r) => r.left + r.width / 2 > left && r.left + r.width / 2 < right);
    return note && { x: note.left + note.width / 2, y: note.top + note.height / 2 };
  });
  expect(target).toBeTruthy();
  await page.mouse.click(target!.x, target!.y);
  await expect(page.getByTestId('selection-overlay').first()).toBeVisible();
  await runCommand(page, 'playback.playFromSelection');
  await expect(cursor(page)).toBeVisible({ timeout: 60_000 });
  expect(await cursorStart(page)).toBeGreaterThanOrEqual(timeline[1][1]);
  expect(await cursorStart(page)).toBeLessThan(timeline[2][1]);
  // Played order 1 → 0: the cursor goes back to the start of the repeat on the same page.
  const firstElement = Number(await cursor(page).getAttribute('data-element-id'));
  await expect
    .poll(async () => (await cursorStart(page)) >= timeline[2][1], { timeout: 15_000 })
    .toBe(true);
  expect(Number(await cursor(page).getAttribute('data-element-id'))).toBeLessThan(firstElement);
});
