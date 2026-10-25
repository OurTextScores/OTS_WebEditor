import { expect, test } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';

type Probe = typeof window & { __webmscore: Score; __calls?: Record<string, number> };

const barX = (transform: string | null) =>
  Number(/translate\(([-\d.]+)px/.exec(transform ?? '')?.[1]);

test('the editor cursor moves continuously from the native map with no engine calls per frame', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.getByTestId('btn-play').click();
  const bar = page.getByTestId('playback-cursor');
  await expect(bar).toBeVisible({ timeout: 60_000 });
  await expect(bar).toHaveAttribute('data-kind', 'continuous');

  // Count map/layout/render calls during steady playback on one page (no page turn is near).
  await page.evaluate(() => {
    const probe = window as Probe;
    probe.__calls = {};
    for (const name of [
      'playbackFollowMap',
      'segmentPositions',
      'measurePositions',
      'playbackTimeline',
      'saveSvg',
      'playbackPositionAt',
    ] as const) {
      const original = (probe.__webmscore[name] as (...args: unknown[]) => unknown).bind(
        probe.__webmscore,
      );
      (probe.__webmscore as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        probe.__calls![name] = (probe.__calls![name] ?? 0) + 1;
        return original(...args);
      };
    }
  });
  const samples: number[] = [];
  for (let i = 0; i < 30; i++) {
    samples.push(barX(await bar.evaluate((el) => (el as HTMLElement).style.transform)));
    await page.waitForTimeout(50);
  }
  expect(await page.evaluate(() => (window as Probe).__calls)).toEqual({});
  // Continuous: positions strictly between segment starts, which a discrete segment cursor never shows.
  const segmentStarts = await page.evaluate(async () => {
    const map = await (window as Probe).__webmscore.playbackFollowMap!();
    return map!.intervals.filter((i) => i.geometry).map((i) => i.geometry!.xStart - map!.spatium);
  });
  const inBetween = samples.filter((x) =>
    segmentStarts.every((start) => Math.abs(start - x) > 0.5),
  );
  expect(inBetween.length).toBeGreaterThan(10);
  expect(samples.every(Number.isFinite)).toBe(true);

  // Desktop placement: one spatium before the interpolated x, inside the sounding segment's box.
  const check = await page.evaluate(async () => {
    const score = (window as Probe).__webmscore;
    const [map, segments] = await Promise.all([
      score.playbackFollowMap!(),
      score.segmentPositions(),
    ]);
    const el = document.querySelector('[data-testid="playback-cursor"]') as HTMLElement;
    const x = Number(/translate\(([-\d.]+)px/.exec(el.style.transform)?.[1]);
    const near = map!.intervals.filter(
      (i) => i.geometry && Math.abs(i.geometry.xStart - map!.spatium - x) < 400,
    );
    return { x, spatium: map!.spatium, near: near.length, segments: segments.elements.length };
  });
  expect(check.near).toBeGreaterThan(0);
  await page.getByTestId('btn-stop').click();
  await expect(bar).toBeHidden();
});

test('the player draws the same moving cursor and keeps its measure shading', async ({ page }) => {
  await page.goto('/?score=%2Ftest_scores%2Fbach_orig.mscz&embed=player');
  await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('player-play').click();
  const cursor = page.getByTestId('player-cursor');
  await expect(cursor).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('active-measure-highlight')).toBeVisible();
  // Past the start-up buffer, while the music is moving.
  await expect
    .poll(async () => Number(await page.getByTestId('player-seek').inputValue()), {
      timeout: 30_000,
    })
    .toBeGreaterThan(1_000);
  // A segment lasts about 214 ms here: a discrete cursor shows at most two positions in a 200 ms window,
  // a continuous one many.
  const xs = await page.evaluate(async () => {
    const rect = () => document.querySelector('[data-testid="player-cursor"]')?.getAttribute('x');
    const seen: string[] = [];
    const started = performance.now();
    while (performance.now() - started < 200) {
      seen.push(rect() ?? '');
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return seen;
  });
  expect(new Set(xs.filter(Boolean)).size).toBeGreaterThan(4);
});
