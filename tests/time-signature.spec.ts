import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand } from './helpers/commands';

test('time signature change starts at selected note', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const readTimeSigs = async (): Promise<string[]> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const bytes: Uint8Array = await score.saveMsc('mscx');
      const xml = new TextDecoder().decode(bytes);
      const matches = Array.from(
        xml.matchAll(
          /<TimeSig>[\s\S]*?<sigN>(\d+)<\/sigN>[\s\S]*?<sigD>(\d+)<\/sigD>[\s\S]*?<\/TimeSig>/g,
        ),
      );
      return matches.map((m) => `${m[1]}/${m[2]}`);
    });
  };

  const initial = await readTimeSigs();
  expect(initial.length).toBeGreaterThan(0);

  const startSig = initial[0];
  // The compact toolbar intentionally exposes common and cut time; use whichever
  // preset differs from the score's initial signature.
  const targetSig = startSig === '2/2' ? '4/4' : '2/2';

  const notes = page.locator('svg .Note');
  const noteCount = await notes.count();
  expect(noteCount).toBeGreaterThan(0);
  await notes.nth(noteCount - 1).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  const [num, den] = targetSig.split('/').map(Number);
  await runCommand(page, `btn-timesig-${num}-${den}`);

  // Start time signature should remain unchanged (change is inserted later in the score).
  await expect.poll(async () => (await readTimeSigs())[0], { timeout: 20_000 }).toBe(startSig);
  await expect
    .poll(async () => (await readTimeSigs()).length, { timeout: 20_000 })
    .toBeGreaterThan(1);
  await expect
    .poll(async () => (await readTimeSigs()).includes(targetSig), { timeout: 20_000 })
    .toBe(true);
});

test('custom time signature applies at selection', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const readTimeSigs = async (): Promise<string[]> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const bytes: Uint8Array = await score.saveMsc('mscx');
      const xml = new TextDecoder().decode(bytes);
      const matches = Array.from(
        xml.matchAll(
          /<TimeSig>[\s\S]*?<sigN>(\d+)<\/sigN>[\s\S]*?<sigD>(\d+)<\/sigD>[\s\S]*?<\/TimeSig>/g,
        ),
      );
      return matches.map((m) => `${m[1]}/${m[2]}`);
    });
  };

  const notes = page.locator('svg .Note');
  const noteCount = await notes.count();
  expect(noteCount).toBeGreaterThan(0);
  await notes.nth(noteCount - 1).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await runCommand(page, 'add.timeSig.custom', { numerator: 5, denominator: 8 });

  await expect
    .poll(async () => (await readTimeSigs()).includes('5/8'), { timeout: 20_000 })
    .toBe(true);
});
