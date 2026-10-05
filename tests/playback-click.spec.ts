import { expect, test } from '@playwright/test';

/** The engine's beat times, and the player's metronome and count-in on top of them. */
test('the playback timeline carries beats, with repeats, a pickup and a tempo change in them', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/playback_timeline.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const occurrences = await page.evaluate(async () => {
    const engine = (
      window as unknown as {
        __webmscore: {
          playbackTimeline: () => Promise<{
            occurrences: {
              measureIndex: number;
              startMs: number;
              endMs: number;
              beatsMs?: number[];
              downbeat?: boolean;
              beatsPerMeasure?: number;
            }[];
          }>;
        };
      }
    ).__webmscore;
    return (await engine.playbackTimeline()).occurrences;
  });
  // The one-beat pickup has no downbeat; every other bar does.
  expect(occurrences[0]).toMatchObject({ beatsMs: [0], downbeat: false, beatsPerMeasure: 4 });
  expect(occurrences[1]).toMatchObject({
    beatsMs: [1000, 2000, 3000, 4000],
    downbeat: true,
    beatsPerMeasure: 4,
  });
  // Bar 2 is played twice (a repeat): its beats appear again, later.
  const second = occurrences.filter((occurrence) => occurrence.measureIndex === 1);
  expect(second).toHaveLength(2);
  expect(second[1].beatsMs).toEqual([9000, 10000, 11000, 12000]);
  // After a tempo change the beats are closer together.
  const faster = occurrences.find((occurrence) => occurrence.measureIndex === 3)!;
  expect(faster.beatsMs).toEqual([13000, 13500, 14000, 14500]);
  for (const occurrence of occurrences) {
    for (const beat of occurrence.beatsMs ?? []) {
      expect(beat).toBeGreaterThanOrEqual(occurrence.startMs);
      expect(beat).toBeLessThan(occurrence.endMs);
    }
  }
});

test.describe('player metronome', () => {
  const PLAYER = '/?score=%2Ftest_scores%2Fplayback_timeline.musicxml&embed=player';

  /** Counts the sources the page starts whose buffer is 30 ms long (a click). */
  const countClicks = (page: import('@playwright/test').Page) =>
    page.evaluate(() => (window as unknown as { __clicks: number[] }).__clicks.length);
  const spyOnClicks = (page: import('@playwright/test').Page) =>
    page.addInitScript(() => {
      const clicks: number[] = [];
      (window as unknown as { __clicks: number[] }).__clicks = clicks;
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function patched(
        this: AudioBufferSourceNode,
        when?: number,
        ...rest: number[]
      ) {
        if (this.buffer && this.buffer.duration > 0.029 && this.buffer.duration < 0.031)
          clicks.push(when ?? 0);
        return original.call(this, when, ...rest);
      };
    });

  test('is off by default, and Count-in needs it on', async ({ page }) => {
    await page.goto(PLAYER);
    await expect(page.getByRole('button', { name: 'Metronome' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByRole('button', { name: 'Count-in' })).toBeDisabled();
    await page.getByRole('button', { name: 'Metronome' }).click();
    await expect(page.getByRole('button', { name: 'Metronome' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Count-in' })).toBeEnabled();
  });

  test('remembers the choice across a reload', async ({ page }) => {
    await page.goto(PLAYER);
    await page.getByRole('button', { name: 'Metronome' }).click();
    await page.getByRole('button', { name: 'Count-in' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Metronome' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Count-in' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('plays no clicks unless switched on, and clicks the beats when it is', async ({ page }) => {
    await spyOnClicks(page);
    await page.goto(PLAYER);
    await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60_000 });
    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause', {
      timeout: 60_000,
    });
    await page.waitForTimeout(1_500);
    expect(await countClicks(page)).toBe(0);

    await page.getByRole('button', { name: 'Metronome' }).click();
    await expect.poll(() => countClicks(page), { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test('a count-in clicks one measure before the music', async ({ page }) => {
    await spyOnClicks(page);
    await page.goto(PLAYER);
    await page.getByRole('button', { name: 'Metronome' }).click();
    await page.getByRole('button', { name: 'Count-in' }).click();
    await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60_000 });
    await page.getByTestId('player-play').click();
    await expect.poll(() => countClicks(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
    const times = await page.evaluate(() =>
      (window as unknown as { __clicks: number[] }).__clicks.slice(0, 4),
    );
    // The pickup bar has one beat, so the count-in is one bar of 4/4 at 60 bpm: a click a second.
    expect(times[1] - times[0]).toBeCloseTo(1, 1);
    expect(times[2] - times[1]).toBeCloseTo(1, 1);
  });
});

test.describe('editor metronome', () => {
  const EDITOR = '/?score=/test_scores/playback_timeline.musicxml';
  const spy = (page: import('@playwright/test').Page) =>
    page.addInitScript(() => {
      const clicks: number[] = [];
      (window as unknown as { __clicks: number[] }).__clicks = clicks;
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function patched(
        this: AudioBufferSourceNode,
        when?: number,
        ...rest: number[]
      ) {
        if (this.buffer && this.buffer.duration > 0.029 && this.buffer.duration < 0.031)
          clicks.push(when ?? 0);
        return original.call(this, when, ...rest);
      };
    });
  const clicks = (page: import('@playwright/test').Page) =>
    page.evaluate(() => (window as unknown as { __clicks: number[] }).__clicks.slice());

  test('the header button and the Playback menu switch the metronome and count-in', async ({
    page,
  }) => {
    await page.goto(EDITOR);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    const button = page.getByTestId('btn-metronome');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('menu-tools').click();
    await page.getByTestId('menu-sub-playback').click();
    const countIn = page.getByTestId('menu-item-playback.countIn');
    await expect(countIn).toHaveAttribute('aria-checked', 'false');
    await countIn.click();
    // The menu closes on a choice; open it again to see the check.
    await page.getByTestId('menu-tools').click();
    await page.getByTestId('menu-sub-playback').click();
    await expect(page.getByTestId('menu-item-playback.countIn')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Escape');

    await page.reload();
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await expect(page.getByTestId('btn-metronome')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Count-in is off until the metronome is on', async ({ page }) => {
    await page.goto(EDITOR);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await page.getByTestId('menu-tools').click();
    await page.getByTestId('menu-sub-playback').click();
    await expect(page.getByTestId('menu-item-playback.countIn')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('playing with the metronome on clicks the beats, counts in first, and stopping silences it', async ({
    page,
  }) => {
    await spy(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('ots-player-click', '1');
      window.localStorage.setItem('ots-player-countin', '1');
    });
    await page.goto(EDITOR);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await page.getByTestId('btn-play').click();
    await expect
      .poll(async () => (await clicks(page)).length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(3);
    const times = await clicks(page);
    // One bar of 4/4 at 60 bpm counted in: a click a second.
    expect(times[1] - times[0]).toBeCloseTo(1, 1);
    await page.getByTestId('btn-stop').click();
    const afterStop = (await clicks(page)).length;
    await page.waitForTimeout(2_500);
    expect((await clicks(page)).length).toBe(afterStop);
  });
});
