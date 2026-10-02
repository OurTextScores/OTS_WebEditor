import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommandAnsweringPrompt } from './helpers/commands';

/**
 * The input/button pair this suite used to drive (input-title, input-subtitle,
 * btn-set-title, btn-set-subtitle) was removed from ScoreSection at some point
 * without the tests being updated or deleted -- see
 * docs/private/SELECTION_WORK_HANDOFF.md open item #3. The underlying mutations
 * (score.setTitleText/setSubtitleText) were never touched; ExpressionSection's
 * Text > Score Header menu now drives them via onOpenHeaderEditor, which prompts
 * for the new text pre-filled with the current value (the same promptForText
 * helper every other Text-menu entry uses). This exercises that path instead.
 */
test('the subtitle prompt is pre-filled from metadata', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  // Cancelling leaves the score alone; what matters is what the prompt offered.
  const prefilled = await runCommandAnsweringPrompt(page, 'btn-text-subtitle', null);
  expect(prefilled).toContain('Bach: Cello Suite');
});

test('title and subtitle persist after save and reload', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  // Returns null on failure rather than throwing: the loader aborts and restarts
  // once notes first appear (docs/private/SELECTION_WORK_HANDOFF.md §4), and a
  // worker call that lands during that restart can throw ("table index out of
  // bounds") instead of returning a stale value. A thrown error inside an
  // expect.poll predicate fails the assertion outright rather than retrying, so
  // swallow it into a mismatching value the poll will naturally retry past once
  // the restart has settled.
  const readHeader = async (): Promise<{ title: string | null; subtitle: string | null }> => {
    try {
      return await page.evaluate(async () => {
        const score = (window as BrowserScoreWindow).__webmscore;
        if (!score?.metadata) {
          throw new Error('window.__webmscore.metadata is not available');
        }
        const metadata = await score.metadata();
        const subtitle =
          typeof score?.subtitle === 'function'
            ? await score.subtitle()
            : typeof metadata?.subtitle === 'string'
              ? metadata.subtitle
              : '';
        return {
          title: typeof metadata?.title === 'string' ? metadata.title : '',
          subtitle,
        };
      });
    } catch {
      return { title: null, subtitle: null };
    }
  };

  const newTitle = 'OTS Title Reload';
  const newSubtitle = 'OTS Subtitle Reload';

  await runCommandAnsweringPrompt(page, 'btn-text-title', newTitle);

  await runCommandAnsweringPrompt(page, 'btn-text-subtitle', newSubtitle);

  await expect.poll(async () => (await readHeader()).title, { timeout: 20_000 }).toBe(newTitle);
  await expect
    .poll(async () => (await readHeader()).subtitle, { timeout: 20_000 })
    .toBe(newSubtitle);

  const exportedXml = await page.evaluate(async () => {
    const score = (window as BrowserScoreWindow).__webmscore;
    if (!score?.saveMsc) {
      throw new Error('window.__webmscore.saveMsc is not available');
    }
    const data = await score.saveMsc('mscx');
    return new TextDecoder().decode(data);
  });
  const exportedMscz = await page.evaluate(async () => {
    const score = (window as BrowserScoreWindow).__webmscore;
    if (!score?.saveMsc) {
      throw new Error('window.__webmscore.saveMsc is not available');
    }
    const data = await score.saveMsc('mscz');
    return Array.from(data);
  });

  expect(exportedXml).toContain(newTitle);
  expect(exportedXml).toContain(newSubtitle);

  await page.getByTestId('open-score-input').setInputFiles({
    name: 'reloaded.mscz',
    mimeType: 'application/vnd.musescore.mscz',
    buffer: Buffer.from(exportedMscz as number[]),
  });

  await page.waitForSelector('svg .Clef', { timeout: 60_000 });
  await expect.poll(async () => (await readHeader()).title, { timeout: 30_000 }).toBe(newTitle);
  await expect
    .poll(async () => (await readHeader()).subtitle, { timeout: 30_000 })
    .toBe(newSubtitle);
});
