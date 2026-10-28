import { expect, test, type Page } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';

type InspectionWindow = typeof window & { __webmscore: Score; __resolveInspection?: () => void; __settledInspection?: boolean };

async function hoverNote(page: Page) {
  await page.locator('[data-testid="svg-container"] svg .Note').first().evaluate((note) => {
    const rect = note.getBoundingClientRect();
    note.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, altKey: true, shiftKey: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
    }));
  });
}

test('inspection is absent by default', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('[data-testid="svg-container"] svg .Note', { timeout: 60_000 });
  await hoverNote(page);
  await expect(page.getByTestId('geometry-inspection-status')).toHaveCount(0);
});

test('opt-in inspection follows the score and leaves selection and score unchanged', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml&inspectGeometry=1');
  await page.waitForSelector('[data-testid="svg-container"] svg .Note', { timeout: 60_000 });
  const before = await page.evaluate(async () => {
    const score = (window as InspectionWindow).__webmscore;
    return { xml: await score.saveXml!(), boxes: await score.getSelectionBoundingBoxes!(), undo: await score.getUndoInfo!() };
  });
  await hoverNote(page);
  const status = page.getByTestId('geometry-inspection-status');
  const box = page.getByTestId('geometry-inspection-box');
  await expect(status).toHaveAttribute('data-status', 'ok');
  await expect(status).toContainText('note');
  await expect(box).toBeVisible();
  expect(await box.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  const aligned = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="geometry-inspection-box"]')!.getBoundingClientRect();
    const note = document.querySelector('[data-testid="svg-container"] svg .Note')!.getBoundingClientRect();
    return box.right > note.left && box.left < note.right && box.bottom > note.top && box.top < note.bottom;
  });
  expect(aligned).toBe(true);
  await page.getByTestId('btn-zoom-in').click();
  await expect.poll(async () => page.evaluate(() => {
    const box = document.querySelector('[data-testid="geometry-inspection-box"]')!.getBoundingClientRect();
    const note = document.querySelector('[data-testid="svg-container"] svg .Note')!.getBoundingClientRect();
    return box.right > note.left && box.left < note.right && box.bottom > note.top && box.top < note.bottom;
  })).toBe(true);
  const after = await page.evaluate(async () => {
    const score = (window as InspectionWindow).__webmscore;
    return { xml: await score.saveXml!(), boxes: await score.getSelectionBoundingBoxes!(), undo: await score.getUndoInfo!() };
  });
  expect(after).toEqual(before);

  // A replaced page SVG must invalidate and re-query the stored point, not retain old geometry.
  await page.evaluate(() => {
    const container = document.querySelector('[data-testid="svg-container"]')!;
    container.innerHTML = container.innerHTML;
  });
  await expect(status).toHaveAttribute('data-status', 'ok');
  await expect(box).toBeVisible();

  // An edit-like keyboard action clears immediately; a late response cannot bring the old box back.
  await page.evaluate(() => {
    const probe = window as InspectionWindow;
    const score = probe.__webmscore;
    const original = score.hitTestScoreObject!.bind(score);
    score.hitTestScoreObject = async (...args) => {
      const hit = await original(...args);
      await new Promise<void>((resolve) => { probe.__resolveInspection = resolve; });
      probe.__settledInspection = true;
      return hit;
    };
  });
  await hoverNote(page);
  await expect(status).toHaveAttribute('data-status', 'pending');
  await expect.poll(() => page.evaluate(() => typeof (window as InspectionWindow).__resolveInspection)).toBe('function');
  await page.keyboard.press('Escape');
  await expect(status).toHaveAttribute('data-status', 'idle');
  await page.evaluate(() => (window as InspectionWindow).__resolveInspection?.());
  await expect.poll(() => page.evaluate(() => (window as InspectionWindow).__settledInspection)).toBe(true);
  await expect(box).toHaveCount(0);
  await expect(status).toHaveAttribute('data-status', 'idle');
  await page.locator('[data-testid="svg-container"] svg .Note').first().click({ force: true });
  await expect.poll(() => page.evaluate(async () => ((await (window as InspectionWindow).__webmscore.getSelectionBoundingBoxes!()).length))).toBeGreaterThan(0);
});

test('inspection does not interfere with note dragging', async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 1600 });
  await page.goto('/?score=/test_scores/single_note_c4.musicxml&inspectGeometry=1');
  const note = page.locator('[data-testid="svg-container"] svg .Note').first();
  await note.waitFor({ timeout: 60_000 });
  await note.click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  const box = await note.boundingBox();
  if (!box) throw new Error('Note geometry unavailable');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(async () => {
    const data = await (window as InspectionWindow).__webmscore.saveXml!() as unknown as string | Uint8Array;
    const xml = typeof data === 'string' ? data : new TextDecoder().decode(data);
    return xml.match(/<step>([A-G])<\/step>/)?.[1];
  }), { timeout: 20_000 }).toBe('E');
});
