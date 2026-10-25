import { expect, test, type Page } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';
import { runCommand } from './helpers/commands';

type Probe = typeof window & {
  __webmscore: Score;
  __starts?: Array<{ frames: number; lead: number }>;
};

const nativeOptions = (page: Page) =>
  page.evaluate(() => (window as Probe).__webmscore.playbackOptions!());
const cursorElement = async (page: Page) =>
  Number(await page.getByTestId('playback-cursor').getAttribute('data-element-id'));

async function open(page: Page, score = 'bach_orig.mscz') {
  await page.goto(`/?score=/test_scores/${score}`);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  // Every source start, with how far ahead of the audio clock it was scheduled.
  await page.evaluate(() => {
    const probe = window as Probe;
    probe.__starts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, ...rest: number[]) {
      probe.__starts!.push({
        frames: this.buffer?.length ?? 0,
        lead: when ? when - this.context.currentTime : 0,
      });
      return start.call(this, when, ...rest);
    };
  });
}

async function setSpeed(page: Page, preset: number) {
  await page.getByTestId('btn-tempo').click();
  await page.getByTestId(`btn-tempo-preset-${preset}`).click();
  await page.keyboard.press('Escape');
}

test('speed set before Play applies to audio, time and duration, and is remembered', async ({
  page,
}) => {
  await open(page);
  const fullDuration = await page.evaluate(
    async () => (await (window as Probe).__webmscore.playbackTimeline!())!.durationMs,
  );
  await setSpeed(page, 50);
  await expect.poll(() => nativeOptions(page)).toMatchObject({ tempoMultiplier: 0.5 });
  const slowDuration = await page.evaluate(
    async () => (await (window as Probe).__webmscore.playbackTimeline!())!.durationMs,
  );
  expect(slowDuration).toBeCloseTo(fullDuration * 2, -2);
  await expect(page.getByTestId('btn-tempo')).toHaveText('50%');
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('playback-cursor')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('playback-time')).toContainText(
    `/ ${Math.floor(slowDuration / 60_000)}:`,
  );
  await page.getByTestId('btn-stop').click();
  // Transient for the score, remembered for the listener.
  expect(await page.evaluate(() => window.localStorage.getItem('ots-playback-tempo'))).toBe('50');
  await page.reload();
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect.poll(() => nativeOptions(page)).toMatchObject({ tempoMultiplier: 0.5 });
  expect(
    await page.evaluate(async () => (await (window as Probe).__webmscore.getUndoInfo!()).index),
  ).toBe(0);
});

test('changing speed while playing continues from the same place without a count-in', async ({
  page,
}) => {
  await open(page);
  await runCommand(page, 'playback.metronome');
  await runCommand(page, 'playback.countIn');
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('playback-cursor')).toBeVisible({ timeout: 60_000 });
  // The explicit Play counted in: its first music block is scheduled about a measure ahead. (Later blocks are
  // scheduled up to the render horizon ahead, so only the first block of a start says anything.)
  const firstMusicLead = () =>
    page.evaluate(() => (window as Probe).__starts!.find((s) => s.frames !== 1_323)?.lead ?? null);
  expect(await firstMusicLead()).toBeGreaterThan(1);
  await expect.poll(() => cursorElement(page), { timeout: 15_000 }).toBeGreaterThan(5);
  const before = await cursorElement(page);
  await page.evaluate(() => ((window as Probe).__starts = []));
  await setSpeed(page, 150);
  await expect.poll(() => nativeOptions(page)).toMatchObject({ tempoMultiplier: 1.5 });
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause', {
    timeout: 30_000,
  });
  await expect.poll(firstMusicLead).not.toBeNull();
  // Music resumed within the preroll: no count-in measure in front of it.
  expect(await firstMusicLead()).toBeLessThan(0.5);
  expect(await cursorElement(page)).toBeGreaterThanOrEqual(before);
  await page.getByTestId('btn-stop').click();
});

test('a paused session stays paused at its place; a preparing one starts under the new speed', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('playback-cursor')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Resume');
  await setSpeed(page, 75);
  await expect.poll(() => nativeOptions(page)).toMatchObject({ tempoMultiplier: 0.75 });
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Resume');
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause', {
    timeout: 30_000,
  });
  await page.getByTestId('btn-stop').click();

  // Hold native preparation, change speed during it, then release.
  await page.evaluate(() => {
    const probe = window as Probe & { __release?: () => void };
    const score = probe.__webmscore;
    const synth = score.synthAudioBatch!.bind(score);
    score.synthAudioBatch = async (...args) => {
      await new Promise<void>((resolve) => (probe.__release = resolve));
      return synth(...args);
    };
  });
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Preparing audio');
  await expect(page.getByTestId('btn-stop')).toHaveAttribute('aria-label', 'Cancel');
  await setSpeed(page, 125);
  // Retirement waits for the in-flight native preparation, so the change lands once it is released.
  await page.evaluate(() => {
    const probe = window as Probe & { __release?: () => void };
    probe.__release?.();
    probe.__release = undefined;
  });
  await expect.poll(() => nativeOptions(page)).toMatchObject({ tempoMultiplier: 1.25 });
  // The coalesced restart prepares again under 1.25; release that one too.
  await expect
    .poll(() => page.evaluate(() => !!(window as Probe & { __release?: () => void }).__release))
    .toBe(true);
  await page.evaluate(() => (window as Probe & { __release?: () => void }).__release?.());
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause', {
    timeout: 30_000,
  });
});

test('Play repeats off changes the audible order and the cursor; on restores it', async ({
  page,
}) => {
  await open(page, 'four_measures.musicxml');
  const sequences = await page.evaluate(async () => {
    const score = (window as Probe).__webmscore;
    await score.selectPartMeasureByIndex!(0, 1);
    await score.toggleRepeatEnd!();
    return (await score.playbackTimeline!())!.occurrences.map((o) => o.measureIndex);
  });
  expect(sequences).toEqual([0, 1, 0, 1, 2, 3]);
  await page.getByTestId('btn-play-repeats').click();
  await expect(page.getByTestId('btn-play-repeats')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => nativeOptions(page)).toMatchObject({ playRepeats: false });
  expect(
    await page.evaluate(async () =>
      (await (window as Probe).__webmscore.playbackTimeline!())!.occurrences.map(
        (o) => o.measureIndex,
      ),
    ),
  ).toEqual([0, 1, 2, 3]);
  await setSpeed(page, 150);
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('playback-cursor')).toBeVisible({ timeout: 60_000 });
  // The cursor only moves forward: the repeat is not played.
  const seen: number[] = [];
  for (let i = 0; i < 20 && (await page.getByTestId('playback-cursor').count()); i++) {
    seen.push(await cursorElement(page));
    await page.waitForTimeout(200);
  }
  expect(seen.length).toBeGreaterThan(5);
  expect(seen.every((id, i) => i === 0 || id >= seen[i - 1])).toBe(true);
  await page.getByTestId('btn-stop').click();
  await runCommand(page, 'playback.playRepeats');
  await expect.poll(() => nativeOptions(page)).toMatchObject({ playRepeats: true });
});

test('compatibility WAV playback is regenerated for a new speed', async ({ page }) => {
  await open(page, 'playback_timeline.musicxml');
  await page.evaluate(() => {
    const probe = window as Probe & { __wavs?: number };
    const score = probe.__webmscore;
    score.synthAudioBatch = undefined;
    const save = score.saveAudio!.bind(score);
    probe.__wavs = 0;
    score.saveAudio = async (...args) => {
      probe.__wavs! += 1;
      return save(...args);
    };
  });
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause', {
    timeout: 60_000,
  });
  await setSpeed(page, 50);
  await expect
    .poll(() => page.evaluate(() => (window as Probe & { __wavs?: number }).__wavs))
    .toBe(2);
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause', {
    timeout: 60_000,
  });
});

test('a narrow editor keeps Play, Stop and the position, with speed and repeats in settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await open(page, 'four_measures.musicxml');
  await expect(page.getByTestId('btn-play')).toBeVisible();
  await expect(page.getByTestId('btn-stop')).toBeVisible();
  await expect(page.getByTestId('playback-time')).toBeVisible();
  await expect(page.getByTestId('btn-tempo')).toBeHidden();
  await page.getByTestId('btn-playback-settings').click();
  await expect(page.getByTestId('settings-play-repeats')).toBeVisible();
  await page.getByTestId('settings-tempo').click();
  await page.getByTestId('settings-tempo-preset-75').click();
  await expect.poll(() => nativeOptions(page)).toMatchObject({ tempoMultiplier: 0.75 });
});

test('the player shares the speed control and its timing follows it', async ({ page }) => {
  await page.goto('/?score=%2Ftest_scores%2Fplayback_timeline.musicxml&embed=player');
  await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 30_000 });
  const full = Number(await page.getByTestId('player-seek').getAttribute('max'));
  await page.getByTestId('player-tempo').click();
  await page.getByTestId('player-tempo-preset-50').click();
  await expect
    .poll(async () => Number(await page.getByTestId('player-seek').getAttribute('max')))
    .toBeCloseTo(full * 2, -2);
  await page.getByTestId('player-play-repeats').click();
  await expect(page.getByTestId('player-play-repeats')).toHaveAttribute('aria-pressed', 'false');
});
