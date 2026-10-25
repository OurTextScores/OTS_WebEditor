import { expect, test, type Page } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';
import { runCommand } from './helpers/commands';

type Probe = typeof window & {
  __webmscore: Score;
  __renders?: Array<{ page: number; cursorMs: number | null }>;
  __preparingSeen?: boolean;
  __slowPage?: number;
  __failPage?: number;
};

/** Logs each page render with where the playback cursor was, and lets a test slow or fail one page. */
async function open(page: Page) {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.evaluate(() => {
    const probe = window as Probe;
    probe.__renders = [];
    probe.__preparingSeen = false;
    const score = probe.__webmscore;
    const save = score.saveSvg.bind(score);
    score.saveSvg = async (pageNumber = 0, ...rest) => {
      const cursor = document.querySelector('[data-testid="playback-cursor"]');
      probe.__renders!.push({
        page: pageNumber,
        cursorMs: cursor ? Number(cursor.getAttribute('data-start-ms')) : null,
      });
      if (pageNumber === probe.__failPage) throw new Error('injected page render failure');
      if (pageNumber === probe.__slowPage)
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      return save(pageNumber, ...rest);
    };
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="playback-preparing-page"]'))
        probe.__preparingSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Seeks to a note on the visible page that sounds `leadMs` before the next page starts, so the turn comes within
 * seconds while leaving the prefetch its normal lead. Located from the engine's own positions, not SVG order.
 */
async function playToPageEnd(page: Page, leadMs = 8_500) {
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('playback-cursor')).toBeVisible({ timeout: 60_000 });
  const point = await page.evaluate(async (lead) => {
    const positions = await (window as Probe).__webmscore.segmentPositions();
    const visible = Number(
      (document.querySelector('[data-testid="page-select"]') as HTMLSelectElement).value,
    );
    const onPage = (id: number) => positions.elements[id]?.page === visible;
    const boundary = Math.min(
      ...positions.events
        .filter((e) => !onPage(e.elid) && positions.elements[e.elid]?.page > visible)
        .map((e) => e.position),
    );
    const wrapper = document.querySelector('[data-testid="score-wrapper"]') as HTMLElement;
    const notes = [...document.querySelectorAll('svg .Note')];
    const candidates = positions.events
      .filter((e) => onPage(e.elid) && e.position <= boundary - lead)
      .sort((a, b) => b.position - a.position);
    // The latest segment before the lead that has a notehead (not a rest), brought into view to be clicked.
    for (const event of candidates) {
      const box = positions.elements[event.elid];
      const rect = wrapper.getBoundingClientRect();
      const zoom = rect.width / wrapper.offsetWidth;
      const inside = (r: DOMRect) => {
        const x = r.left + r.width / 2 - rect.left;
        const y = r.top + r.height / 2 - rect.top;
        return (
          x >= box.x * zoom &&
          x < (box.x + box.sx) * zoom &&
          y >= box.y * zoom &&
          y <= (box.y + box.sy) * zoom
        );
      };
      const note = notes.find((element) => inside(element.getBoundingClientRect()));
      if (!note) continue;
      note.scrollIntoView({ block: 'center' });
      const r = note.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, leadMs);
  expect(point).toBeTruthy();
  await page.mouse.click(point!.x, point!.y);
}

const firstStartOnPage = (page: Page, pageIndex: number) =>
  page.evaluate(async (index) => {
    const positions = await (window as Probe).__webmscore.segmentPositions();
    const starts = positions.events
      .filter((event) => positions.elements[event.elid]?.page === index)
      .map((event) => event.position);
    return Math.min(...starts);
  }, pageIndex);

test('the next page is prepared before playback reaches it and swapped in without waiting', async ({
  page,
}) => {
  await open(page);
  const pageSelect = page.getByTestId('page-select');
  await playToPageEnd(page);
  await expect(pageSelect).toHaveValue('2', { timeout: 30_000 });
  await expect(page.getByTestId('playback-cursor')).toBeVisible();
  const renders = await page.evaluate(() => (window as Probe).__renders!);
  const pageTwo = renders.filter((render) => render.page === 2);
  expect(pageTwo).toHaveLength(1);
  // Rendered while the cursor was still on the previous page.
  expect(pageTwo[0].cursorMs).not.toBeNull();
  expect(pageTwo[0].cursorMs!).toBeLessThan(await firstStartOnPage(page, 2));
  expect(await page.evaluate(() => (window as Probe).__preparingSeen)).toBe(false);
  await expect(page.locator('svg .Note')).toHaveCount(340);
});

test('a repeat back to an earlier page is prepared in performance order', async ({ page }) => {
  await open(page);
  const pageSelect = page.getByTestId('page-select');
  // Repeat measures 19–22 across the page break (page 1 → page 3 → back to page 1).
  await page.evaluate(async () => {
    const score = (window as Probe).__webmscore;
    await score.selectPartMeasureByIndex!(0, 18);
    await score.toggleRepeatStart!();
    await score.selectPartMeasureByIndex!(0, 21);
    await score.toggleRepeatEnd!();
    await score.clearSelection!();
  });
  await playToPageEnd(page);
  await expect(pageSelect).toHaveValue('2', { timeout: 30_000 });
  await expect(pageSelect).toHaveValue('0', { timeout: 30_000 });
  const renders = await page.evaluate(() => (window as Probe).__renders!);
  const back = renders.filter((render) => render.page === 0 && render.cursorMs !== null);
  expect(back.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as Probe).__preparingSeen)).toBe(false);
});

test('a manual page change wins over a slow following turn, which never overwrites it', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => ((window as Probe).__slowPage = 2));
  const pageSelect = page.getByTestId('page-select');
  // Little lead: the turn arrives while the slow render is still running.
  await playToPageEnd(page, 1_500);
  // Following is waiting on the slow page-3 render.
  await expect(page.getByTestId('playback-preparing-page')).toBeVisible({ timeout: 30_000 });
  // Sample the shown page through the race: the late playback render must never appear, even briefly.
  await page.evaluate(() => {
    const probe = window as Probe & { __shown?: string[] };
    probe.__shown = [];
    setInterval(() => {
      const value = (document.querySelector('[data-testid="page-select"]') as HTMLSelectElement)
        .value;
      if (probe.__shown!.at(-1) !== value) probe.__shown!.push(value);
    }, 20);
  });
  await runCommand(page, 'view.goto.nextPage');
  await expect(pageSelect).toHaveValue('1');
  await page.waitForTimeout(5_000);
  expect(
    await page.evaluate(() => (window as Probe & { __shown?: string[] }).__shown),
  ).not.toContain('2');
  await expect(pageSelect).toHaveValue('1');
  // Page 2 of this score is blank: no notes were painted over it by the late render.
  await expect(page.locator('svg .Note')).toHaveCount(0);
  await expect(page.getByTestId('btn-resume-following')).toBeVisible();
});

test('a page that fails to render leaves the current page readable and playback running', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => ((window as Probe).__failPage = 2));
  const pageSelect = page.getByTestId('page-select');
  await playToPageEnd(page);
  const boundary = await firstStartOnPage(page, 2);
  // The cursor is not drawn on a page that is not shown, so watch the position label instead.
  const seconds = async () => {
    const [minutes, rest] = ((await page.getByTestId('playback-time').textContent()) ?? '0:00')
      .split('/')[0]
      .trim()
      .split(':');
    return Number(minutes) * 60 + Number(rest);
  };
  await expect.poll(seconds, { timeout: 30_000 }).toBeGreaterThan(boundary / 1000 + 1);
  await page.waitForTimeout(1_000);
  await expect(pageSelect).toHaveValue('0');
  await expect(page.locator('svg .Note')).toHaveCount(320);
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause');
});

test('changing speed while the next page is being prepared still turns to the right page', async ({
  page,
}) => {
  await open(page);
  await playToPageEnd(page);
  await page.getByTestId('btn-tempo').click();
  await page.getByTestId('btn-tempo-preset-150').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('page-select')).toHaveValue('2', { timeout: 30_000 });
  await expect(page.locator('svg .Note')).toHaveCount(340);
});
