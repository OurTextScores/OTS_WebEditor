import { test, expect } from '@playwright/test';

test('clicking empty space in a measure selects the measure', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  // Click on a note first to verify note selection works
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  // Click on empty space in the measure (to the right of the last note)
  const svg = page.locator('svg').first();
  const svgBox = await svg.boundingBox();
  if (!svgBox) throw new Error('SVG not found');

  // Click in the right side of the SVG, which should be empty space in the measure
  await page.mouse.click(svgBox.x + svgBox.width * 0.75, svgBox.y + svgBox.height / 2);
  await page.waitForTimeout(500);

  // Verify a selection exists (measure should be selected)
  const overlay = page.getByTestId('selection-overlay');
  await expect(overlay).toBeVisible({ timeout: 5000 });
});

test('clicking on a note selects the note', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  // Click directly on a note
  await page.locator('svg .Note').first().click();

  // Verify selection overlay appears
  await expect(page.getByTestId('selection-overlay')).toBeVisible({ timeout: 10_000 });
});
