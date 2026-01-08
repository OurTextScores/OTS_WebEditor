import { expect, test } from 'playwright/test';

test('toolbar dropdown renders above the score', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const dropdown = page.getByTestId('dropdown-export');
  await dropdown.locator('summary').click();

  const menu = dropdown.locator('div').first();
  await expect(menu).toBeVisible();

  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const menuOnTop = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const menuEl = document.querySelector('[data-testid="dropdown-export"] > div');
    return !!(el && menuEl && menuEl.contains(el));
  }, center);

  expect(menuOnTop).toBe(true);
});
