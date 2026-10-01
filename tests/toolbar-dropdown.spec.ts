import { expect, test } from 'playwright/test';

// These exercise the ribbon's own File and Help dropdowns, which the v2 shell replaces with
// menus, so they run against `?shell=legacy` until the ribbon is deleted (Phase 5).

test('toolbar dropdown renders above the score', async ({ page }) => {
  await page.goto('/?shell=legacy&score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const dropdown = page.getByTestId('dropdown-export');
  await dropdown.click();

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const menuOnTop = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const menuEl = document.querySelector('[role="menu"]');
    return !!(el && menuEl && menuEl.contains(el));
  }, center);

  expect(menuOnTop).toBe(true);
});

test('dropdowns open/close and break buttons show disabled tooltips', async ({ page }) => {
  await page.goto('/?shell=legacy&score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const tooltipText = 'Select a note or rest to split the bar.';
  const newLineButton = page.getByTestId('btn-new-line');
  const newPageButton = page.getByTestId('btn-new-page');

  await expect(newLineButton).toBeDisabled();
  await expect(newLineButton.locator('..')).toHaveAttribute('title', tooltipText);
  await expect(newPageButton.locator('..')).toHaveAttribute('title', tooltipText);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await expect(newLineButton).toBeEnabled();
  await expect(newLineButton.locator('..')).not.toHaveAttribute('title', tooltipText);

  const dropdown = page.getByTestId('dropdown-accidental');
  await dropdown.click();
  await expect(dropdown).toHaveAttribute('aria-expanded', 'true');

  await page.getByTestId('btn-acc-3').click();
  await expect(dropdown).toHaveAttribute('aria-expanded', 'false');
});

test('shortcuts dropdown lists hotkeys', async ({ page }) => {
  await page.goto('/?shell=legacy&score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const dropdown = page.getByTestId('dropdown-shortcuts');
  await dropdown.click();

  const menu = page.getByRole('menu');
  await expect(menu).toContainText('Delete / Backspace');
  await expect(menu).toContainText('Ctrl/Cmd + Z');
  await expect(menu).toContainText('Cmd + Shift + Z');
  await expect(menu).toContainText('Arrow Up/Down');
  await expect(menu).toContainText('Ctrl/Cmd + V');
});
