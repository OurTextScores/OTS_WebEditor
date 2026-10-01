import { expect, test } from 'playwright/test';

/**
 * A ribbon menu item must be what the pointer hits at its own centre. The hairpin menu's
 * glyphs once overflowed into the next item, so clicking "Crescendo" added a decrescendo;
 * nothing else noticed because both items exist and both do something.
 */
test('ribbon menu items hit-test to themselves', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  const triggers = await page
    .locator('[data-testid^="dropdown-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') as string));
  expect(triggers.length).toBeGreaterThan(10);

  const wrong: string[] = [];
  let checked = 0;
  for (const trigger of triggers) {
    const button = page.getByTestId(trigger);
    if (!(await button.isEnabled())) continue;
    await button.click();
    await page.waitForTimeout(250); // let the menu finish opening
    const result = await page.evaluate(() => {
      const bad: string[] = [];
      let seen = 0;
      for (const item of document.querySelectorAll<HTMLElement>('[role="menuitem"][data-testid]')) {
        const rect = item.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        // Items scrolled out of a tall menu cannot be hit-tested.
        if (rect.height === 0 || y < 0 || y > innerHeight || x < 0 || x > innerWidth) continue;
        seen += 1;
        const hit = document.elementFromPoint(x, y);
        if (!item.contains(hit)) {
          bad.push(
            `${item.dataset.testid} -> ${hit?.closest('[data-testid]')?.getAttribute('data-testid')}`,
          );
        }
      }
      return { bad, seen };
    });
    checked += result.seen;
    wrong.push(...result.bad.map((entry) => `${trigger}: ${entry}`));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  }

  expect(checked).toBeGreaterThan(50);
  expect(wrong).toEqual([]);
});

test('the hairpin menu adds the hairpin it names', async ({ page }) => {
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

  for (const [testId, type] of [
    ['btn-hairpin-cresc', 0],
    ['btn-hairpin-decresc', 1],
  ] as const) {
    await page.getByTestId('dropdown-hairpins').click();
    await page.getByTestId(testId).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __hairpinCalls: unknown[][] }).__hairpinCalls.at(-1),
        ),
      )
      .toEqual([type]);
  }
});
