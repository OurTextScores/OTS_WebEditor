import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { expect, test } from '@playwright/test';

test.describe('player video export', () => {
  test('exports a score to a downloadable video with a video and an audio track', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/?score=%2Ftest_scores%2Ftwo_chords.musicxml&embed=player');
    await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60_000 });
    const durationMs = Number(await page.getByTestId('player-seek').getAttribute('max'));

    await page.getByTestId('player-export-video').click();
    const dialog = page.getByTestId('export-video-dialog');
    await expect(dialog).toBeVisible();
    // The summary names the container the browser will use once it has probed its encoders.
    await expect(page.getByTestId('export-video-summary')).toContainText(/MP4|WEBM/i, {
      timeout: 15_000,
    });

    const download = page.waitForEvent('download', { timeout: 180_000 });
    await page.getByTestId('export-video-start').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.(mp4|webm)$/);

    const path = await file.path();
    const bytes = await readFile(path);
    expect(bytes.byteLength).toBeGreaterThan(1_000);

    const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    expect(video).not.toBeNull();
    expect(audio).not.toBeNull();
    expect(video!.displayWidth).toBe(1920);
    expect(video!.displayHeight).toBe(1080);
    // The picture lasts as long as the sound, which rings out past the last note: never shorter than the score.
    const duration = await input.computeDuration();
    expect(duration * 1000).toBeGreaterThanOrEqual(durationMs);
    expect(
      Math.abs((await video!.computeDuration()) - (await audio!.computeDuration())),
    ).toBeLessThan(0.1);

    await expect(dialog).toContainText('Saved');
  });

  test('cancel stops an export and downloads nothing', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/?score=%2Ftest_scores%2Fbach_orig.mscz&embed=player');
    await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60_000 });
    await page.getByTestId('player-export-video').click();
    await expect(page.getByTestId('export-video-summary')).toContainText(/MP4|WEBM/i, {
      timeout: 15_000,
    });
    let downloaded = false;
    page.on('download', () => {
      downloaded = true;
    });
    await page.getByTestId('export-video-start').click();
    await expect(page.getByTestId('export-video-progress')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('export-video-progress')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('export-video-start')).toBeEnabled();
    expect(downloaded).toBe(false);
  });

  test('is off while the score is playing', async ({ page }) => {
    await page.goto('/?score=%2Ftest_scores%2Ftwo_chords.musicxml&embed=player');
    await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId('player-export-video')).toBeEnabled();
    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-export-video')).toBeDisabled({ timeout: 15_000 });
  });
});
