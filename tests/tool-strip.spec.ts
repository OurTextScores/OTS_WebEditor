import { expect, test, type Page } from 'playwright/test';

/** Counts calls to an engine method on the live score, so a click can be tied to what the engine was asked to do. */
async function spyOnEngine(page: Page, method: string) {
  await page.evaluate((name) => {
    const score = (
      window as unknown as { __webmscore: Record<string, (...a: unknown[]) => unknown> }
    ).__webmscore;
    const original = score[name].bind(score);
    const calls: unknown[][] = [];
    (window as unknown as Record<string, unknown>).__spyCalls = calls;
    score[name] = (...args: unknown[]) => {
      calls.push(args);
      return original(...args);
    };
  }, method);
  return () =>
    page.evaluate(() => (window as unknown as { __spyCalls: unknown[][] }).__spyCalls.length);
}

async function open(page: Page, selectNote: boolean) {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  if (selectNote) {
    await page.locator('svg .Note').first().click();
    await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  }
}

test('the tools flow on after the quick controls in one toolbar, with no scrollbar', async ({
  page,
}) => {
  for (const width of [1280, 900, 700]) {
    await page.setViewportSize({ width, height: 800 });
    await open(page, false);
    const row = page.getByTestId('tool-strip-row');
    await expect(page.getByTestId('tool-strip')).toBeVisible();
    for (const id of [
      'btn-note-input',
      'btn-open-score',
      'btn-new-score',
      'dropdown-export',
      'btn-select-all',
      'btn-delete',
      'link-help',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // One toolbar holds both the quick controls and the tools.
    await expect(row.getByTestId('btn-note-input')).toBeVisible();
    await expect(row.getByTestId('btn-delete')).toBeVisible();
    // Nothing scrolls sideways: the controls wrap instead.
    const overflow = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('[data-testid="tool-strip-row"]')!;
      return {
        scroll: element.scrollWidth,
        client: element.clientWidth,
        overflowX: getComputedStyle(element).overflowX,
      };
    });
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    expect(overflow.overflowX).toBe('visible');
    // Wrapped lines of buttons are not touching.
    const lineGaps = await page.evaluate(() => {
      const boxes = [
        ...document.querySelectorAll<HTMLElement>('[data-testid="tool-strip-row"] button'),
      ]
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0);
      const tops = [...new Set(boxes.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
      const bottoms = tops.map((t) =>
        Math.max(...boxes.filter((r) => Math.round(r.top) === t).map((r) => r.bottom)),
      );
      return tops.slice(1).map((t, i) => t - bottoms[i]);
    });
    for (const gap of lineGaps) expect(gap).toBeGreaterThanOrEqual(6);
    // Neighbouring buttons on a line are not touching either.
    const sideGaps = await page.evaluate(() => {
      const boxes = [
        ...document.querySelectorAll<HTMLElement>('[data-testid="tool-strip-row"] button'),
      ]
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0);
      const lines = new Map<number, DOMRect[]>();
      for (const r of boxes)
        lines.set(Math.round(r.top), [...(lines.get(Math.round(r.top)) ?? []), r]);
      const gaps: number[] = [];
      for (const line of lines.values()) {
        const sorted = line.sort((a, b) => a.left - b.left);
        sorted.slice(1).forEach((r, i) => gaps.push(r.left - sorted[i].right));
      }
      return gaps;
    });
    expect(sideGaps.length).toBeGreaterThan(10);
    for (const gap of sideGaps) expect(gap).toBeGreaterThanOrEqual(3);
    // The quick controls come before the tools.
    const quick = await page.getByTestId('btn-note-input').boundingBox();
    const tool = await page.getByTestId('btn-open-score').boundingBox();
    expect(tool!.y > quick!.y + quick!.height - 1 || tool!.x > quick!.x).toBe(true);
  }
});

test('hiding the tools leaves the quick controls', async ({ page }) => {
  await open(page, false);
  await page.getByTestId('btn-tool-strip-toggle').click();
  await expect(page.getByTestId('btn-note-input')).toBeVisible();
  await expect(page.getByTestId('btn-delete')).toHaveCount(0);
});

test('Delete runs the engine command when something is selected', async ({ page }) => {
  await open(page, true);
  const count = await spyOnEngine(page, 'deleteSelection');
  await expect(page.getByTestId('btn-delete')).not.toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('btn-delete').click();
  await expect.poll(count).toBe(1);
});

test('Delete with nothing selected does nothing and says why', async ({ page }) => {
  await open(page, false);
  const count = await spyOnEngine(page, 'deleteSelection');
  const button = page.getByTestId('btn-delete');
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  // Playwright treats aria-disabled as not actionable; the point here is that a real click is inert.
  await button.click({ force: true });
  await page.waitForTimeout(300);
  expect(await count()).toBe(0);
  await expect(page.getByTestId('announcer')).toContainText('Delete: Select something first');
});

test('the selection filter menu lists its ten items as checkable, and stays open while toggling', async ({
  page,
}) => {
  await open(page, false);
  await page.getByTestId('dropdown-selection-filter').click();
  const menu = page.getByTestId('selection-filter-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemcheckbox')).toHaveCount(10);
  const voice1 = menu.getByTestId('selection-filter-1');
  const before = await voice1.getAttribute('aria-checked');
  await voice1.click();
  await expect(menu).toBeVisible();
  await expect(voice1).not.toHaveAttribute('aria-checked', before ?? 'true');
});

test('the export menu offers every format the ribbon did', async ({ page }) => {
  await open(page, false);
  await page.getByTestId('dropdown-export').click();
  for (const id of [
    'btn-export-mscz',
    'btn-export-pdf',
    'btn-export-svg',
    'btn-export-png',
    'btn-export-mscx',
    'btn-export-musicxml',
    'btn-export-mxl',
    'btn-export-abc',
    'btn-export-midi',
    'btn-export-audio',
    'btn-export-current-page-audio',
    'btn-export-google-drive',
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

test('strip controls hit-test to themselves', async ({ page }) => {
  await open(page, true);
  const result = await page.evaluate(() => {
    const bad: string[] = [];
    let seen = 0;
    for (const control of document.querySelectorAll<HTMLElement>(
      '[data-testid="tool-strip-row"] [data-strip-control]',
    )) {
      const rect = control.getBoundingClientRect();
      if (rect.width === 0 || rect.right > innerWidth) continue;
      seen += 1;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!control.contains(hit)) bad.push(control.dataset.stripControl ?? '?');
    }
    return { bad, seen };
  });
  expect(result.seen).toBeGreaterThan(8);
  expect(result.bad).toEqual([]);
});

test('arrow keys walk the strip, and the strip is one tab stop', async ({ page }) => {
  await open(page, true);
  await page.getByTestId('btn-open-score').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('btn-new-score')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByTestId('link-help')).toBeFocused();
  const tabStops = await page
    .locator('[data-testid="tool-strip-row"] [data-strip-control][tabindex="0"]')
    .count();
  expect(tabStops).toBe(1);
});

test('the strip can be hidden, and stays hidden after a reload', async ({ page }) => {
  await open(page, false);
  await page.getByTestId('btn-tool-strip-toggle').click();
  await expect(page.getByTestId('btn-delete')).toHaveCount(0);
  await expect(page.getByTestId('btn-note-input')).toBeVisible();
  await page.reload();
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect(page.getByTestId('tool-strip')).toHaveAttribute('data-collapsed', 'true');
  await page.getByTestId('btn-tool-strip-toggle').click();
  await expect(page.getByTestId('btn-delete')).toBeVisible();
});

test('the palette says why a command is unavailable (gate reasons reach the live editor)', async ({
  page,
}) => {
  await open(page, false);
  await page.keyboard.press('Control+Shift+P');
  await page.getByTestId('palette-input').fill('delete');
  const row = page
    .getByTestId('palette-row')
    .filter({ hasText: /^Delete/ })
    .first();
  await expect(row).toHaveAttribute('aria-disabled', 'true');
  await expect(row.getByTestId('palette-row-reason')).toHaveText('Select something first');
});
