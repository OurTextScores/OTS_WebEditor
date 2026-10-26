import { expect, test } from '@playwright/test';

// Release escape hatches (design §18 Phase 9) are build-time, so this spec needs its own server:
//   NEXT_PUBLIC_OTS_PLAYBACK_CURSOR=measure NEXT_PUBLIC_OTS_PLAYBACK_AUTOFOLLOW=0 PLAYWRIGHT_PORT=3014 \
//     npx playwright test tests/playback-release-gates.spec.ts
test.skip(
  process.env.NEXT_PUBLIC_OTS_PLAYBACK_CURSOR !== 'measure' ||
    process.env.NEXT_PUBLIC_OTS_PLAYBACK_AUTOFOLLOW !== '0',
  'Runs only against a build with both playback release gates set',
);

test('a gated editor tracks measures, reads no note or follow maps, and never turns pages itself', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: string[] = ((window as unknown as { __calls: string[] }).__calls = []);
    const wrap = () => {
      const score = (window as unknown as { __webmscore?: Record<string, unknown> }).__webmscore;
      if (!score) return void setTimeout(wrap, 50);
      for (const name of ['segmentPositions', 'playbackFollowMap']) {
        const original = (score[name] as (...args: unknown[]) => unknown).bind(score);
        score[name] = (...args: unknown[]) => {
          calls.push(name);
          return original(...args);
        };
      }
    };
    wrap();
  });
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect(page.getByTestId('btn-follow-playback')).toHaveCount(0);
  await page.evaluate(() => ((window as unknown as { __calls: string[] }).__calls.length = 0));
  await page.getByTestId('btn-play').click();
  const cursor = page.getByTestId('playback-cursor');
  await expect(cursor).toBeVisible({ timeout: 60_000 });
  await expect(cursor).toHaveAttribute('data-kind', 'measure');
  // Seek to the end of page 1: playback moves to the next page, the view does not.
  await page.locator('svg .Note').last().click();
  await expect(page.getByTestId('btn-jump-to-playback')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('page-select')).toHaveValue('0');
  expect(await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)).toEqual(
    [],
  );
  // Audio and the speed control are untouched.
  await expect(page.getByTestId('btn-stop')).toBeEnabled();
});

test('a gated player offers measure highlighting only and no moving cursor in video export', async ({
  page,
}) => {
  await page.goto('/?score=%2Ftest_scores%2Fbach_orig.mscz&embed=player&highlight=note');
  await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Note highlighting' })).toHaveCount(0);
  // Export is offered only while stopped.
  await page.getByTestId('player-export-video').click();
  await expect(page.getByText('Moving cursor')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByTestId('player-play').click();
  await expect(page.getByTestId('active-measure-highlight')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('player-cursor')).toHaveCount(0);
});
