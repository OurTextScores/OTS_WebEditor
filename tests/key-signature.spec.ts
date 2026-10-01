import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand } from './helpers/commands';

test('key signature can change and revert', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const readKeySignature = async (): Promise<number> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.getKeySignature) {
        throw new Error('window.__webmscore.getKeySignature is not available');
      }
      return Number(await score.getKeySignature());
    });
  };

  const initial = await readKeySignature();
  const alternate = initial === 0 ? 1 : 0;

  await runCommand(page, `btn-keysig-${alternate}`);
  await expect.poll(async () => await readKeySignature(), { timeout: 20_000 }).toBe(alternate);

  await runCommand(page, `btn-keysig-${initial}`);
  await expect.poll(async () => await readKeySignature(), { timeout: 20_000 }).toBe(initial);
});

test('key signature change starts at selected note', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const readStartKeySignature = async (): Promise<number> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.getKeySignature) {
        throw new Error('window.__webmscore.getKeySignature is not available');
      }
      return Number(await score.getKeySignature());
    });
  };

  const readMusicXmlFifths = async (): Promise<number[]> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      const xml: string = await score.saveXml();
      return Array.from(xml.matchAll(/<fifths>(-?\d+)<\/fifths>/g)).map((m) => Number(m[1]));
    });
  };

  const start = await readStartKeySignature();
  const target = start === 0 ? 2 : 0;

  const notes = page.locator('svg .Note');
  const noteCount = await notes.count();
  expect(noteCount).toBeGreaterThan(0);
  await notes.nth(noteCount - 1).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await runCommand(page, `btn-keysig-${target}`);

  // Start key signature should remain unchanged (change is inserted later in the score).
  await expect.poll(async () => await readStartKeySignature(), { timeout: 20_000 }).toBe(start);

  // MusicXML should now contain a later key change.
  await expect
    .poll(async () => (await readMusicXmlFifths()).length, { timeout: 20_000 })
    .toBeGreaterThan(1);
  await expect.poll(async () => (await readMusicXmlFifths())[0], { timeout: 20_000 }).toBe(start);
  await expect
    .poll(async () => (await readMusicXmlFifths()).includes(target), { timeout: 20_000 })
    .toBe(true);
});
