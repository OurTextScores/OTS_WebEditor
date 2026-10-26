import { expect, test } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';

test('visual leads are independent, remembered and shared by the player and editor', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/playback_timeline.musicxml&embed=player');
  await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60000 });
  await page.getByRole('button', { name: 'Playback visual timing' }).click();
  const cursor = page.getByRole('slider', { name: 'Cursor lead (ms)' });
  const measure = page.getByRole('slider', { name: 'Measure lead (ms)' });
  await expect(cursor).toHaveValue('0');
  await cursor.press('ArrowRight');
  await measure.press('ArrowLeft');
  await expect(cursor).toHaveValue('5');
  await expect(measure).toHaveValue('-5');
  await page.goto('/?score=/test_scores/playback_timeline.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60000 });
  await page.getByTestId('btn-playback-settings').click();
  await page.getByRole('button', { name: 'Playback visual timing' }).click();
  await expect(page.getByRole('slider', { name: 'Cursor lead (ms)' })).toHaveValue('5');
  await expect(page.getByRole('slider', { name: 'Measure lead (ms)' })).toHaveValue('-5');
  await page.getByRole('button', { name: 'Reset visual timing' }).click();
  await expect(page.getByRole('slider', { name: 'Cursor lead (ms)' })).toHaveValue('0');
  await expect(page.getByRole('slider', { name: 'Measure lead (ms)' })).toHaveValue('0');
});

test('an idle edit warms the prepared tracks and the next Play reuses them without hidden audio', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 60000 });
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause', {
    timeout: 60000,
  });
  await page.getByTestId('btn-stop').click();
  await page.evaluate(async () => {
    const target = window as typeof window & {
      __webmscore: Score;
      __warmups?: number;
      __starts?: number;
    };
    const score = target.__webmscore;
    const warmup = score.warmupPlayback!.bind(score);
    target.__warmups = 0;
    target.__starts = 0;
    score.warmupPlayback = async () => {
      const result = await warmup();
      if (result) target.__warmups! += 1;
      return result;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      target.__starts! += 1;
      return start.apply(this, args);
    };
    await score.selectAll?.();
    await score.pitchUp?.();
  });
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { __warmups: number }).__warmups), {
      timeout: 15000,
    })
    .toBe(1);
  const idle = await page.evaluate(async () => {
    const target = window as typeof window & { __webmscore: Score; __starts: number };
    return { diagnostic: await target.__webmscore.playbackDiagnostics!(), starts: target.__starts };
  });
  expect(idle.starts).toBe(0);
  expect(idle.diagnostic).toMatchObject({
    activeStreams: 0,
    sequences: 1,
    lastPrepare: { reused: false },
  });
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause');
  const hot = await page.evaluate(() =>
    (window as typeof window & { __webmscore: Score }).__webmscore.playbackDiagnostics!(),
  );
  expect(hot?.lastPrepare.reused).toBe(true);
  await page.getByTestId('btn-stop').click();
});
