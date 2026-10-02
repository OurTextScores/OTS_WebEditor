import { expect, test } from 'playwright/test';
import { openMenuPath } from './helpers/commands';

/**
 * A ribbon menu item must be what the pointer hits at its own centre. The hairpin menu's
 * glyphs once overflowed into the next item, so clicking "Crescendo" added a decrescendo;
 * nothing else noticed because both items exist and both do something.
 */
/**
 * A toolbar control must be what the pointer hits at its own centre. The notation glyphs
 * inside the duration and accidental buttons are text boxes that can overflow into the
 * neighbouring button (they carry `pointer-events: none` for exactly that reason), so a
 * click on "Quarter" once landed on "Half".
 */
test('Write toolbar controls hit-test to themselves', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  const result = await page.evaluate(() => {
    const bad: string[] = [];
    let seen = 0;
    for (const control of document.querySelectorAll<HTMLElement>(
      '[data-testid="write-toolbar"] button',
    )) {
      const rect = control.getBoundingClientRect();
      // Scrolled out of the toolbar's row: cannot be hit-tested.
      if (rect.width === 0 || rect.right > innerWidth) continue;
      seen += 1;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!control.contains(hit)) {
        bad.push(
          `${control.dataset.testid} -> ${hit?.closest('[data-testid]')?.getAttribute('data-testid')}`,
        );
      }
    }
    return { bad, seen };
  });
  expect(result.seen).toBeGreaterThan(15);
  expect(result.bad).toEqual([]);
});

test('the Hairpins menu adds the hairpin it names', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await page.evaluate(() => {
    const score = (
      window as unknown as { __webmscore: Record<string, (...a: unknown[]) => unknown> }
    ).__webmscore;
    const original = score.addHairpin.bind(score);
    const calls: unknown[][] = [];
    (window as unknown as { __hairpinCalls: unknown[][] }).__hairpinCalls = calls;
    score.addHairpin = (...args: unknown[]) => {
      calls.push(args);
      return original(...args);
    };
  });

  for (const [label, type] of [
    ['Crescendo', 0],
    ['Decrescendo', 1],
  ] as const) {
    await openMenuPath(page, ['Add', 'Lines', 'Hairpins', label]);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __hairpinCalls: unknown[][] }).__hairpinCalls.at(-1),
        ),
      )
      .toEqual([type]);
  }
});
