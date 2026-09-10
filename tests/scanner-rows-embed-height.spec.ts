import { expect, test } from 'playwright/test';

declare global {
  interface Window {
    /** Every height the embed has reported to this host, oldest first. */
    __heightReports?: number[];
  }
}

/**
 * The frame the host draws must be the height of the rows inside it.
 *
 * Rows mode does not scroll itself — a scrollable box inside a fixed-height
 * frame gives a reader two scrollbars and the shorter of two viewports — so the
 * embed reports its document height and the host sizes the frame to match.
 *
 * That contract has broken twice, and neither break is visible to jsdom, which
 * has no layout. Once as a ratchet, where the frame grew a few hundred pixels a
 * second. Once because the compare view was `position: fixed`: out of flow, it
 * added nothing to the document height, so the embed reported the height of the
 * ordinary editor canvas behind it — a whole engraved page — and the host drew
 * 4314px of frame around 390px of rows. The same mismatch runs the other way
 * just as easily, clipping rows to a frame too short for them with nothing able
 * to scroll to the rest.
 */
test('sizes the frame to the rows, not to the editor canvas behind them', async ({ page }) => {
  await page.goto('/rows-host.html');

  const frame = page.frameLocator('#frame');
  await frame.locator('[data-testid="system-row-header"]').first().waitFor({ timeout: 60_000 });
  // The reported height settles once the readings have engraved.
  await expect
    .poll(async () => (await page.evaluate(() => window.__heightReports?.length)) ?? 0, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  await page.waitForTimeout(2_000);

  const measured = await page.evaluate(() => {
    const el = document.getElementById('frame') as HTMLIFrameElement;
    const doc = el.contentDocument!;
    const rows = doc.querySelector('[data-testid="system-row-header"]');
    let root: Element | null = rows;
    while (root && !String((root as HTMLElement).className).includes('flex flex-col gap-3 p-4')) {
      root = root.parentElement;
    }
    return {
      reported: doc.body.scrollHeight,
      rowsHeight: root ? Math.round(root.getBoundingClientRect().height) : null,
      // Whatever is left in flow behind the rows must not decide the height.
      canvasHeight: Math.round(
        doc.querySelector('.overflow-y-visible')?.getBoundingClientRect().height ?? 0,
      ),
    };
  });

  expect(measured.rowsHeight).not.toBeNull();
  expect(measured.rowsHeight!).toBeGreaterThan(100);
  // The document is the rows and nothing else. Padding on the chain around them
  // is a few pixels; a canvas behind them would be hundreds or thousands.
  expect(Math.abs(measured.reported - measured.rowsHeight!)).toBeLessThan(64);
  expect(measured.canvasHeight).toBe(0);
});
