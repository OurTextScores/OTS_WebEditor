import { expect, test } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';

test('worker returns a read-only note snapshot without changing selection or score', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const result = await page.evaluate(async () => {
    const score = (window as typeof window & { __webmscore: Score }).__webmscore;
    if (!score.hitTestScoreObject || !score.getSelectionBoundingBoxes || !score.getUndoInfo || !score.saveXml) {
      throw new Error('Snapshot capability or selection verification unavailable');
    }
    const note = document.querySelector('svg .Note')!;
    const svg = note.closest('svg')!;
    const rect = note.getBoundingClientRect();
    const root = svg.getBoundingClientRect();
    const view = svg.viewBox.baseVal;
    const x = view.x + (rect.left + rect.width / 2 - root.left) * view.width / root.width;
    const y = view.y + (rect.top + rect.height / 2 - root.top) * view.height / root.height;
    const beforeXml = await score.saveXml();
    const beforeSelection = await score.getSelectionBoundingBoxes();
    const beforeUndo = await score.getUndoInfo();
    const hit = await score.hitTestScoreObject(0, x, y);
    const invalid = await score.hitTestScoreObject(0, NaN, y);
    return { hit, invalid, beforeXml, afterXml: await score.saveXml(), beforeSelection,
      afterSelection: await score.getSelectionBoundingBoxes(), beforeUndo, afterUndo: await score.getUndoInfo() };
  });
  expect(result.hit.status).toBe('ok');
  if (result.hit.status !== 'ok') throw new Error('Expected a note hit');
  expect(result.hit.kind).toBe('note');
  expect(result.hit.geometry?.width).toBeGreaterThan(0);
  expect(result.invalid.status).toBe('invalid-input');
  expect(result.afterXml).toBe(result.beforeXml);
  expect(result.afterSelection).toEqual(result.beforeSelection);
  expect(result.afterUndo).toEqual(result.beforeUndo);
});
