import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';

const scoreState = async (page: import('@playwright/test').Page) => page.evaluate(async () => {
  const score = (window as typeof window & { __webmscore: Score }).__webmscore;
  if (!score.saveXml || !score.getUndoInfo) throw new Error('Score verification unavailable');
  const data = await score.saveXml();
  const xml = typeof data === 'string' ? data : new TextDecoder().decode(data);
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const notes = [...document.querySelectorAll('note')].filter(note => note.querySelector('pitch'));
  const note = notes[3];
  return { step: note.querySelector('pitch > step')?.textContent,
    staff: note.querySelector('staff')?.textContent || '1',
    voice: note.querySelector('voice')?.textContent, undo: (await score.getUndoInfo()).index };
});

test('staff controls move the selected chord, retain selection and support undo', async ({ page }) => {
  test.setTimeout(180_000);
  const xml = await readFile('tools/musescore/fixtures/osmd-fidelity/cross-staff.musicxml', 'utf8');
  await page.route(url => url.pathname === '/test_scores/staff-control.musicxml', route => route.fulfill({
    status: 200, contentType: 'application/xml', body: xml,
  }));
  const editorPath = process.env.STAFF_MOVE_EDITOR_PATH || '/';
  await page.goto(`${editorPath}?score=/test_scores/staff-control.musicxml`, { timeout: 120_000 });
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect(page.getByTestId('btn-move-staff-up')).toHaveAttribute('aria-disabled', 'true');
  // The fixture's fourth rendered note is F on the lower staff, in voice one.
  const crossStaffNote = page.locator('svg .Note').nth(3);
  await crossStaffNote.scrollIntoViewIfNeeded();
  await crossStaffNote.click();
  await expect(page.getByTestId('btn-move-staff-up')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 60_000 });
  const before = await scoreState(page);
  expect(before).toMatchObject({ step: 'F', staff: '2' });
  await page.getByTestId('btn-move-staff-down').click();
  await expect(page.getByText('The selected notes or rests cannot move to that staff.')).toBeVisible();
  expect(await scoreState(page)).toEqual(before);
  await page.getByTestId('btn-move-staff-up').click();
  await expect.poll(async () => (await scoreState(page)).staff, { timeout: 30_000 }).toBe('1');
  const moved = await scoreState(page);
  expect(moved).toEqual({ ...before, staff: '1', undo: before.undo + 1 });
  await expect(page.getByTestId('btn-move-staff-down')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 60_000 });
  await page.getByTestId('btn-move-staff-down').click();
  await expect.poll(async () => (await scoreState(page)).staff, { timeout: 30_000 }).toBe('2');
  expect((await scoreState(page)).undo).toBe(before.undo + 2);
  await expect(page.getByTestId('btn-undo')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 60_000 });
  await page.getByTestId('btn-undo').click();
  await expect.poll(async () => (await scoreState(page)).staff, { timeout: 30_000 }).toBe('1');
  // Simulate an older worker that does not advertise the optional capability.
  await page.evaluate(() => {
    const score = (window as typeof window & { __webmscore: Score }).__webmscore;
    Object.defineProperty(score, 'moveSelectedChordRestToStaff', { value: undefined, configurable: true });
  });
  await page.getByTestId('btn-zoom-in').click();
  await expect(page.getByTestId('btn-move-staff-up')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('btn-move-staff-down')).toHaveAttribute('aria-disabled', 'true');
});
