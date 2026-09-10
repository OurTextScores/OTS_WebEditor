import { expect, test } from '@playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';

test('native timeline expands pickup, repeats, endings, and tempo changes', async ({ page }) => {
  await page.goto('/?score=/test_scores/playback_timeline.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean((window as BrowserScoreWindow).__webmscore?.playbackTimeline),
    undefined,
    { timeout: 20_000 },
  );

  const timeline = await page.evaluate(async () => {
    const score = (window as BrowserScoreWindow).__webmscore;
    if (!score?.playbackTimeline) {
      throw new Error('window.__webmscore.playbackTimeline is not available');
    }
    return score.playbackTimeline();
  });

  expect(timeline).not.toBeNull();
  expect(timeline?.schemaVersion).toBe(1);
  expect(timeline?.durationMs).toBe(17_000);
  expect(timeline?.renderDurationMs).toBe(20_000);
  expect(timeline?.occurrences.map((occurrence) => occurrence.measureIndex)).toEqual([
    0, // one-beat pickup; not repeated
    1,
    2, // first pass and first ending
    1,
    3, // repeated body and second ending
    4,
  ]);
  expect(timeline?.occurrences.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
    [0, 1_000],
    [1_000, 5_000],
    [5_000, 9_000],
    [9_000, 13_000],
    [13_000, 15_000], // tempo changes from quarter=60 to quarter=120
    [15_000, 17_000],
  ]);
});

test('native float WAV compatibility audio decodes through Web Audio', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?score=/test_scores/playback_timeline.musicxml');
  await page.waitForFunction(
    () => Boolean((window as BrowserScoreWindow).__webmscore?.saveAudio),
    undefined,
    { timeout: 60_000 },
  );

  const result = await page.evaluate(async () => {
    const score = (window as BrowserScoreWindow).__webmscore;
    if (!score?.setSoundFont || !score.saveAudio) {
      throw new Error('Compatibility audio exports are unavailable');
    }
    const soundFontResponse = await fetch('/soundfonts/default.sf3');
    if (!soundFontResponse.ok)
      throw new Error(`Soundfont fetch failed (${soundFontResponse.status})`);
    await score.setSoundFont(new Uint8Array(await soundFontResponse.arrayBuffer()));
    const wav = await score.saveAudio('wav');
    const context = new AudioContext({ sampleRate: 44_100 });
    const decoded = await context.decodeAudioData(wav.slice().buffer as ArrayBuffer);
    const gain = context.createGain();
    gain.connect(context.destination);
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(gain);
    source.start(0, 1);
    source.stop();
    await context.close();
    return {
      wavBytes: wav.byteLength,
      duration: decoded.duration,
      channels: decoded.numberOfChannels,
    };
  });

  expect(result.wavBytes).toBeGreaterThan(1_000_000);
  expect(result.duration).toBeCloseTo(20, 1);
  expect(result.channels).toBe(2);
});
