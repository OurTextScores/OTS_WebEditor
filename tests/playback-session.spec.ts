import { expect, test } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';

test('editor Stop invalidates native preparation before an iterator exists', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.evaluate(() => {
    const target = window as typeof window & {
      __webmscore: Score;
      __releasePreparation?: () => void;
      __prepared?: boolean;
      __cancelled?: number;
      __sources?: number;
    };
    const originalStart = AudioBufferSourceNode.prototype.start;
    target.__sources = 0;
    AudioBufferSourceNode.prototype.start = function (...args) {
      target.__sources! += 1;
      return originalStart.apply(this, args);
    };
    const score = target.__webmscore;
    const synth = score.synthAudioBatch!.bind(score);
    score.synthAudioBatch = async (...args) => {
      target.__prepared = true;
      await new Promise<void>((resolve) => {
        target.__releasePreparation = resolve;
      });
      const iterator = await synth(...args);
      return async (cancel) => {
        if (cancel) target.__cancelled = (target.__cancelled ?? 0) + 1;
        return iterator(cancel);
      };
    };
  });
  await page.getByTestId('btn-play').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { __prepared?: boolean }).__prepared),
    )
    .toBe(true);
  await expect(page.getByTestId('btn-stop')).toBeEnabled();
  await page.getByTestId('btn-stop').click();
  await page.evaluate(() =>
    (window as typeof window & { __releasePreparation?: () => void }).__releasePreparation?.(),
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { __cancelled?: number }).__cancelled),
    )
    .toBe(1);
  expect(
    await page.evaluate(() => (window as typeof window & { __sources?: number }).__sources),
  ).toBe(0);
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Play');
});

test('editor WAV compatibility uses Web Audio and notation edits stop its source', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/playback_timeline.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.evaluate(() => {
    const target = window as typeof window & {
      __webmscore: Score;
      __wavStarts?: number;
      __wavStops?: number;
      __decodes?: number;
    };
    target.__webmscore.synthAudioBatch = undefined;
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (...args) {
      target.__decodes = (target.__decodes ?? 0) + 1;
      return decode.apply(this, args);
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer && this.buffer.length > 512)
        target.__wavStarts = (target.__wavStarts ?? 0) + 1;
      return start.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args) {
      if (this.buffer && this.buffer.length > 512) target.__wavStops = (target.__wavStops ?? 0) + 1;
      return stop.apply(this, args);
    };
  });
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause', {
    timeout: 60_000,
  });
  await page.evaluate(async () => {
    const score = (window as typeof window & { __webmscore: Score }).__webmscore;
    await score.selectAll?.();
    await score.pitchUp?.();
  });
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Play');
  const result = await page.evaluate(() => {
    const target = window as typeof window & {
      __wavStarts?: number;
      __wavStops?: number;
      __decodes?: number;
    };
    return { starts: target.__wavStarts, stops: target.__wavStops, decodes: target.__decodes };
  });
  expect(result).toEqual({ starts: 1, stops: 1, decodes: 1 });
});

test('editor recovers from a stalled worker without starting PCM blocks in the past', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/playback_timeline.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.evaluate(() => {
    const target = window as typeof window & {
      __webmscore: Score;
      __starts?: number[];
      __late?: number;
      __stalled?: boolean;
    };
    target.__starts = [];
    target.__late = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
      if (this.buffer?.length === 512) {
        target.__starts!.push(when);
        if (when < this.context.currentTime - 0.003) target.__late! += 1;
      }
      return start.call(this, when, ...rest);
    };
    const score = target.__webmscore;
    const synth = score.synthAudioBatch!.bind(score);
    score.synthAudioBatch = async (...args) => {
      const iterator = await synth(...args);
      let pulls = 0;
      return async (cancel) => {
        if (!cancel && ++pulls === 2) {
          target.__stalled = true;
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
        return iterator(cancel);
      };
    };
  });
  await page.getByTestId('btn-play').click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as typeof window & { __starts?: number[] }).__starts?.length ?? 0,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(4);
  await page.getByTestId('btn-stop').click();
  const result = await page.evaluate(() => {
    const target = window as typeof window & {
      __starts: number[];
      __late: number;
      __stalled: boolean;
    };
    return { times: target.__starts.slice(0, 4), late: target.__late, stalled: target.__stalled };
  });
  expect(result.stalled).toBe(true);
  expect(result.late).toBe(0);
  // Two blocks were scheduled before the injected stall. The third starts on the new anchor.
  expect(result.times[2] - result.times[1]).toBeGreaterThan(0.25);
  expect(result.times[3] - result.times[2]).toBeCloseTo(512 / 44100, 4);
});
