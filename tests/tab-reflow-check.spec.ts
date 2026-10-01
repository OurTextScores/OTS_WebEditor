// Checks the legacy AI Tools tab strip's wrapping; the v2 shell uses a tool picker instead.
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 700, height: 900 } });

test('sidebar tabs reflow instead of extending offscreen', async ({ page }) => {
  await page.goto('/?shell=legacy&score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.getByTestId('expand-panel-ai-tools').click();

  const tabIds = [
    'tab-ai',
    'tab-notagen',
    'tab-transcoda',
    'tab-multitrack-vae',
    'tab-harmony',
    'tab-functional-harmony',
    'tab-mma',
  ];
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const tops = new Set<number>();
  for (const id of tabIds) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).toBeTruthy();
    expect(box!.x + box!.width, `${id} extends offscreen`).toBeLessThanOrEqual(viewportWidth);
    tops.add(Math.round(box!.y / 10));
  }
  expect(tops.size).toBeGreaterThan(1);
});
