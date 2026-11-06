import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '../helpers/diagnostic-test';

/**
 * Performer mode timings (docs/private/PERFORMER_MODE_IMPLEMENTATION_PLAN_2026-11-05.md, Phases 1 and 6): open to the
 * first page laid out for an iPad-sized screen, and a pedal turn from the key press to the first frame showing the
 * new page. Run against a production build (`next build && next start -p 3300`, then
 * `PLAYWRIGHT_PORT=3300 npm run test:perf -- performer`). Budget: a cached turn within 100 ms.
 */

test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

const SCORES = ['/test_scores/bach_orig.mscz', '/test_scores/men-base.musicxml'];
const results: Record<string, unknown> = {};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0);
};

/** Key press to the first frame after the page's data-page changes, on the page's clock. */
async function timedTurn(page: Page, key: string): Promise<number | null> {
  const before = await page.getByTestId('performer-page-svg').getAttribute('data-page');
  await page.evaluate((from) => {
    const w = window as Window & { __turn?: { start?: number; end?: number } };
    w.__turn = {};
    document.addEventListener('keydown', () => (w.__turn!.start = performance.now()), {
      capture: true,
      once: true,
    });
    const observer = new MutationObserver(() => {
      const now = document
        .querySelector('[data-testid="performer-page-svg"]')
        ?.getAttribute('data-page');
      if (now === null || now === undefined || now === from) return;
      observer.disconnect();
      requestAnimationFrame(() => (w.__turn!.end = performance.now()));
    });
    observer.observe(document.body, { subtree: true, attributes: true, childList: true });
  }, before);
  await page.keyboard.press(key);
  try {
    await expect
      .poll(
        () => page.evaluate(() => (window as Window & { __turn?: { end?: number } }).__turn?.end),
        {
          timeout: 10_000,
        },
      )
      .toBeDefined();
  } catch {
    return null; // no turn (the last page)
  }
  return page.evaluate(() => {
    const t = (window as Window & { __turn?: { start?: number; end?: number } }).__turn!;
    return Math.round(t.end! - t.start!);
  });
}

test.afterAll(() => {
  const dir = resolve(__dirname, '../../test-results/perf');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, `performer-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
    JSON.stringify(results, null, 2),
  );
  console.log('PERFORMER', JSON.stringify(results, null, 2));
});

for (const score of SCORES) {
  test(`open and turn: ${score}`, async ({ page }) => {
    const openedAt = Date.now();
    await page.goto(`/perform?score=${encodeURIComponent(score)}`);
    await expect(page.getByTestId('performer-page-svg')).toBeVisible({ timeout: 300_000 });
    const openMs = Date.now() - openedAt;
    await page.waitForTimeout(1500); // the neighbours prepared
    const turns: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const ms = await timedTurn(page, 'ArrowRight');
      if (ms === null) break;
      turns.push(ms);
      await page.waitForTimeout(450); // past the debounce, and time to prepare the next page
    }
    results[score] = {
      openToFirstPageMs: openMs,
      turnMs: { median: median(turns), samples: turns },
    };
    expect(turns.length).toBeGreaterThan(0);
  });
}
