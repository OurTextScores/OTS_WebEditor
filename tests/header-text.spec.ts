import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommandAnsweringPrompt } from './helpers/commands';

/**
 * The input/button pair this test used to drive (input-title, btn-set-title,
 * input-composer, btn-set-composer) was removed from ScoreSection at some point
 * without the test being updated or deleted -- see docs/private/SELECTION_WORK_HANDOFF.md
 * open item #3. The mutations themselves (score.setTitleText/setComposerText) were
 * never touched; ExpressionSection's Text > Score Header menu now drives them via
 * onOpenHeaderEditor, prompting for the new text the same way every other Text-menu
 * entry (Staff Text, System Text, ...) already does. This exercises that path.
 */
test('title and composer text can be edited', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const readHeader = async (): Promise<{ title: string; composer: string }> => {
    return page.evaluate(async () => {
      const score = (window as BrowserScoreWindow).__webmscore;
      if (!score?.metadata) {
        throw new Error('window.__webmscore.metadata is not available');
      }
      const metadata = await score.metadata();
      return {
        title: typeof metadata?.title === 'string' ? metadata.title : '',
        composer: typeof metadata?.composer === 'string' ? metadata.composer : '',
      };
    });
  };

  const newTitle = 'OTS Title Test';
  const newComposer = 'OTS Composer Test';

  await runCommandAnsweringPrompt(page, 'btn-text-title', newTitle);
  await expect.poll(async () => (await readHeader()).title, { timeout: 20_000 }).toBe(newTitle);

  await runCommandAnsweringPrompt(page, 'btn-text-composer', newComposer);
  await expect
    .poll(async () => (await readHeader()).composer, { timeout: 20_000 })
    .toBe(newComposer);
});
