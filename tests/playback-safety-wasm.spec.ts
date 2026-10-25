import { expect, test } from '@playwright/test';
import type { Score, SynthAudioBatchChunk } from '../lib/webmscore-loader';
import { testSoundfont } from '../tools/musescore/soundfont-fixture.mjs';

test('worker rejects retired stream owners and reloads the same soundfont path', async ({
  page,
}) => {
  // This test owns font installation; background default-font warmup must not race its two fixtures.
  await page.route(/\.sf[23](?:\?|$)/, (route) => route.abort());
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const result = await page.evaluate(
    async ({ loudFont, quietFont }) => {
      const score = (window as typeof window & { __webmscore?: Score }).__webmscore;
      if (!score?.setSoundFont || !score.synthAudioBatch || !score.playbackCapabilities)
        throw new Error('Playback bridge unavailable');
      const caps = await score.playbackCapabilities();
      const level = (batch: SynthAudioBatchChunk[]) => {
        let peak = 0;
        for (const r of batch) {
          const floats = new Float32Array(
            r.chunk.buffer,
            r.chunk.byteOffset,
            r.chunk.byteLength / 4,
          );
          for (const value of floats) peak = Math.max(peak, Math.abs(value));
        }
        return peak;
      };
      await score.setSoundFont(new Uint8Array(loudFont));
      const retired = await score.synthAudioBatch(0, 16);
      await retired();
      const current = await score.synthAudioBatch(0, 16);
      const staleCancel = await retired(true);
      const first = await current();
      const loud = level(first);
      await score.setSoundFont(new Uint8Array(quietFont));
      const fontCancelled = await current();
      const quietStream = await score.synthAudioBatch(0, 16);
      const quiet = level(await quietStream());
      await quietStream(true);
      return {
        caps,
        staleDone: staleCancel.every((r) => r.done && !r.chunk.length),
        firstTime: first[0].startTime,
        fontDone: fontCancelled.every((r) => r.done && !r.chunk.length),
        loud,
        quiet,
      };
    },
    { loudFont: Array.from(testSoundfont()), quietFont: Array.from(testSoundfont(1440)) },
  );
  expect(result.caps).toMatchObject({
    schemaVersion: 1,
    streamHandlesVersion: 1,
    partialLayoutSafe: true,
    soundFontGeneration: true,
  });
  expect(result.staleDone).toBe(true);
  expect(result.firstTime).toBe(0);
  expect(result.fontDone).toBe(true);
  expect(result.loud).toBeGreaterThan(0.001);
  expect(result.quiet).toBeLessThan(result.loud / 100);
});

test('transport preserves 44100 Hz PCM on a 48000 Hz browser context', async ({ page }) => {
  await page.addInitScript(() => {
    type RatesWindow = typeof window & {
      __pcmRates?: Array<{ context: number; source: number; duration: number }>;
    };
    const target = window as RatesWindow;
    target.__pcmRates = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super({ ...options, sampleRate: 48_000 });
      }
    };
    const original = NativeContext.prototype.createBuffer;
    NativeContext.prototype.createBuffer = function (channels, frames, rate) {
      const buffer = original.call(this, channels, frames, rate);
      target.__pcmRates?.push({
        context: this.sampleRate,
        source: rate,
        duration: buffer.duration,
      });
      return buffer;
    };
  });
  await page.goto('/?score=/test_scores/playback_timeline.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(
    () => (window as typeof window & { __pcmRates?: unknown[] }).__pcmRates?.length,
  );
  await page.getByTestId('btn-stop').click();
  const rates = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __pcmRates: Array<{ context: number; source: number; duration: number }>;
        }
      ).__pcmRates,
  );
  expect(rates.length).toBeGreaterThan(0);
  expect(rates.every((r) => r.context === 48_000 && r.source === 44_100)).toBe(true);
  expect(rates[0].duration).toBeCloseTo(512 / 44_100, 8);
});
