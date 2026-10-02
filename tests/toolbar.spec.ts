import { test, expect } from '@playwright/test';
import { runCommand, waitForCommandEnabled } from './helpers/commands';

type ToolbarScoreWindow = typeof window & {
  __webmscore?: {
    insertMeasures?: (...args: unknown[]) => Promise<unknown>;
    saveMsc?: (format: 'mscx') => Promise<Uint8Array>;
  };
};

// The ribbon's bar controls became commands (Add ▸ Measures ▸ ..., Edit ▸ ...); these keep
// the engine-level behaviour they covered.

test('the bar commands are enabled once a score is loaded', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml', { waitUntil: 'networkidle' });
  await page.waitForSelector('svg', { timeout: 20000 });
  await page.waitForFunction(
    () => Boolean((window as ToolbarScoreWindow).__webmscore?.insertMeasures),
    { timeout: 20000 },
  );
  await waitForCommandEnabled(page, 'add.measures');
  await waitForCommandEnabled(page, 'add.pickup');
});

test('remove trailing empty measures works', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readMscx = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as ToolbarScoreWindow).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const data = await score.saveMsc('mscx');
      return new TextDecoder().decode(data);
    });
  };

  const countMeasures = (xml: string) => (xml.match(/<Measure>/g) || []).length;

  // Get initial measure count
  const initialMeasures = countMeasures(await readMscx());

  // Add 3 empty measures at the end
  await runCommand(page, 'add.measures', { count: 3, target: 'end' });

  // Wait for measures to be added
  await expect
    .poll(async () => countMeasures(await readMscx()), { timeout: 20_000 })
    .toBe(initialMeasures + 3);

  await runCommand(page, 'btn-remove-trailing-empty');

  // Verify the empty measures were removed
  await expect
    .poll(async () => countMeasures(await readMscx()), { timeout: 20_000 })
    .toBe(initialMeasures);

  // Test undo - measures should come back
  await page.keyboard.press('Control+Z');
  await expect
    .poll(async () => countMeasures(await readMscx()), { timeout: 20_000 })
    .toBe(initialMeasures + 3);

  // Test redo - measures should be removed again
  await page.keyboard.press('Control+Y');
  await expect
    .poll(async () => countMeasures(await readMscx()), { timeout: 20_000 })
    .toBe(initialMeasures);
});

test('Add Note button is absent from the Write toolbar', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml', { waitUntil: 'networkidle' });
  await page.waitForSelector('svg', { timeout: 20000 });

  await expect(page.getByTestId('write-toolbar')).toBeVisible();
  await expect(page.getByTestId('btn-add-note-top')).not.toBeVisible();
});
