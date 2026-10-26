import { expect, test } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';
import { runCommand } from './helpers/commands';

test.beforeEach(async ({ page }) => {
  await page.route(/\.sf[23](?:\?|$)/, (route) =>
    route.fulfill({
      path: 'public/soundfonts/default.sf3',
      contentType: 'application/octet-stream',
    }),
  );
});

test('editor measure and notehead highlights toggle independently, preserve notation and remember the choice', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 60000 });
  const originals = await page
    .locator('svg .Note')
    .evaluateAll((nodes) =>
      nodes.map((el) => [el.getAttribute('fill'), el.getAttribute('stroke')]),
    );
  const undoIndex = () =>
    page.evaluate(
      async () =>
        (await (window as typeof window & { __webmscore: Score }).__webmscore.getUndoInfo!()).index,
    );
  const before = await undoIndex();
  await page.getByTestId('btn-play').click();
  const cursor = page.getByTestId('playback-cursor');
  const measure = page.getByTestId('playback-measure-highlight');
  const notes = page.locator('svg .ots-playback-notehead');
  await expect(cursor).toBeVisible({ timeout: 60000 });
  await expect(measure).toBeVisible();
  await expect(notes).toHaveCount(0);
  await page.getByTestId('btn-playback-settings').click();
  const noteToggle = page.getByRole('button', { name: 'Notehead highlighting', exact: true });
  const measureToggle = page.getByRole('button', { name: 'Measure highlighting', exact: true });
  await expect(measureToggle).toHaveAttribute('aria-pressed', 'true');
  await noteToggle.click();
  await expect.poll(() => notes.count()).toBeGreaterThan(0);
  await expect(measure).toBeVisible();
  await expect(cursor).toBeVisible();
  await measureToggle.click();
  await expect(measure).toBeHidden();
  await expect.poll(() => notes.count()).toBeGreaterThan(0);
  await noteToggle.click();
  await expect(notes).toHaveCount(0);
  await expect(cursor).toBeVisible();
  await noteToggle.click();
  await page.getByTestId('btn-playback-settings').click();
  await page.getByTestId('btn-stop').click();
  await expect(measure).toBeHidden();
  await expect(notes).toHaveCount(0);
  expect(
    await page
      .locator('svg .Note')
      .evaluateAll((nodes) =>
        nodes.map((el) => [el.getAttribute('fill'), el.getAttribute('stroke')]),
      ),
  ).toEqual(originals);
  expect(await undoIndex()).toBe(before);
  await page.reload();
  await page.waitForSelector('svg .Note', { timeout: 60000 });
  await page.getByTestId('btn-playback-settings').click();
  await expect(measureToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(noteToggle).toHaveAttribute('aria-pressed', 'true');
});

test('highlights turn pages with playback and hide on a manually selected page', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ots-editor-highlight-noteheads', '1'));
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 60000 });
  await page.getByTestId('btn-play').click();
  const measure = page.getByTestId('playback-measure-highlight');
  const notes = page.locator('svg .ots-playback-notehead');
  await expect(measure).toBeVisible({ timeout: 60000 });
  await expect.poll(() => notes.count()).toBeGreaterThan(0);
  await page.locator('svg .Note').last().click();
  const pageSelect = page.getByTestId('page-select');
  await expect(pageSelect).not.toHaveValue('0', { timeout: 30000 });
  const playbackPage = await pageSelect.inputValue();
  await expect(measure).toBeVisible();
  await expect.poll(() => notes.count()).toBeGreaterThan(0);
  const measurePage = await measure.evaluate(async (el) => {
    const score = (window as typeof window & { __webmscore: Score }).__webmscore;
    return (await score.measurePositions()).elements[Number((el as HTMLElement).dataset.elementId)]
      .page;
  });
  expect(measurePage).toBe(Number(playbackPage));
  await page.getByTestId('btn-play').click();
  await runCommand(page, 'view.goto.prevPage');
  await expect(measure).toBeHidden();
  await expect(notes).toHaveCount(0);
  await page.getByTestId('btn-resume-following').click();
  await expect(pageSelect).toHaveValue(playbackPage);
  await expect(measure).toBeVisible();
  await expect.poll(() => notes.count()).toBeGreaterThan(0);
  await page.getByTestId('btn-stop').click();
  await expect(measure).toBeHidden();
  await expect(notes).toHaveCount(0);
});

test('panels opened during playback remain opaque above the score', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 60000 });
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('playback-cursor')).toBeVisible({ timeout: 60000 });
  await runCommand(page, 'view.panel.aiTools');
  const panel = page.getByTestId('xml-sidebar');
  await expect(panel).toBeVisible();
  const appearance = await panel.evaluate((el) => {
    const chrome = el.firstElementChild!;
    const style = getComputedStyle(chrome);
    const ancestors = [];
    for (let node: Element | null = chrome; node; node = node.parentElement)
      ancestors.push(getComputedStyle(node).opacity);
    const bounds = el.getBoundingClientRect();
    return {
      background: style.backgroundColor,
      ancestors,
      coversScore: el.contains(
        document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2),
      ),
    };
  });
  expect(appearance.background).toBe('rgb(255, 255, 255)');
  expect(appearance.ancestors.every((opacity) => opacity === '1')).toBe(true);
  expect(appearance.coversScore).toBe(true);
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause');
  await page.getByTestId('btn-stop').click();
});
