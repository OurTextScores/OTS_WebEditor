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

  test('is reachable on a phone, from the More menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/?score=%2Ftest_scores%2Ftwo_chords.musicxml&embed=player');
    await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId('player-export-video')).toBeHidden();
    await page.getByLabel('More player controls').click();
    await page.getByTestId('player-export-video-menu').click();
    await expect(page.getByTestId('export-video-dialog')).toBeVisible();
    await expect(page.getByTestId('export-video-summary')).toContainText(/MP4|WEBM/i, {
      timeout: 15_000,
    });
  });

  test('is off while the score is playing', async ({ page }) => {
    await page.goto('/?score=%2Ftest_scores%2Ftwo_chords.musicxml&embed=player');
    await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId('player-export-video')).toBeEnabled();
    await page.getByTestId('player-play').click();
    await expect(page.getByTestId('player-export-video')).toBeDisabled({ timeout: 15_000 });
  });
});

test.describe('player video export to a chosen file', () => {
  test('streams into the file the browser picker returns, and downloads nothing', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    // Chromium's save picker needs a real dialog; stand in for it with a file in the origin-private file system, which
    // supports the same createWritable() the export streams into.
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).showSaveFilePicker = async (options: {
        suggestedName: string;
      }) => {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(options.suggestedName, { create: true });
        (window as unknown as Record<string, unknown>).__pickedName = options.suggestedName;
        return handle;
      };
    });
    let downloaded = false;
    page.on('download', () => {
      downloaded = true;
    });
    await page.goto('/?score=%2Ftest_scores%2Ftwo_chords.musicxml&embed=player');
    await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60_000 });
    await page.getByTestId('player-export-video').click();
    await expect(page.getByTestId('export-video-summary')).toContainText(/MP4|WEBM/i, {
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Choose file' }).click();
    await expect(page.getByTestId('export-video-summary')).toContainText(
      'written to the file you choose',
    );
    await page.getByTestId('export-video-start').click();
    await expect(page.getByTestId('export-video-dialog')).toContainText('Saved', {
      timeout: 120_000,
    });

    const written = await page.evaluate(async () => {
      const name = (window as unknown as { __pickedName: string }).__pickedName;
      const root = await navigator.storage.getDirectory();
      const file = await (await root.getFileHandle(name)).getFile();
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      return {
        name,
        size: file.size,
        head: Array.from(head),
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
      };
    });
    expect(written.name).toMatch(/\.(mp4|webm)$/);
    expect(written.size).toBeGreaterThan(1_000);
    // EBML header of a WebM, or the start of an MP4 box size: a real container, not an empty file.
    expect(written.head.some((byte) => byte !== 0)).toBe(true);
    // Streamed writes can seek (the container's header is finished last): the file must still parse whole.
    const input = new Input({
      source: new BufferSource(new Uint8Array(written.bytes)),
      formats: ALL_FORMATS,
    });
    expect(await input.getPrimaryVideoTrack()).not.toBeNull();
    expect(await input.getPrimaryAudioTrack()).not.toBeNull();
    expect(await input.computeDuration()).toBeGreaterThan(1.5);
    expect(downloaded).toBe(false);
  });
});
