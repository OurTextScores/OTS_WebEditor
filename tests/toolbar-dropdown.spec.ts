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

test('dropdowns open/close and break buttons show disabled tooltips', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
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
  await dropdown.locator('summary').click();
  await expect(dropdown).toHaveAttribute('open', '');

  await dropdown.getByTestId('btn-acc-3').click();
  await expect(dropdown).not.toHaveAttribute('open', '');
});

test('shortcuts dropdown lists hotkeys', async ({ page }) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const dropdown = page.getByTestId('dropdown-shortcuts');
  await dropdown.locator('summary').click();

  await expect(dropdown).toContainText('Delete / Backspace');
  await expect(dropdown).toContainText('Ctrl/Cmd + Z');
  await expect(dropdown).toContainText('Cmd + Shift + Z');
  await expect(dropdown).toContainText('Ctrl/Cmd + V');
});
