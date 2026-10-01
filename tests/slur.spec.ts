import { expect, test } from 'playwright/test';
import { runCommand } from './helpers/commands';

const loadThreeNotes = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page
    .getByTestId('open-score-input')
    .setInputFiles('public/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect(page.getByTestId('btn-note-input')).toBeEnabled({ timeout: 60_000 });
};

const selectFirstThroughThirdNotes = async (page: import('@playwright/test').Page) => {
  const notes = page.locator('svg .Note');
  await notes.nth(0).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  const rightmost = await notes.evaluateAll((elements) =>
    elements.reduce(
      (best, element) => {
        const rect = element.getBoundingClientRect();
        const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        return !best || point.x > best.x ? point : best;
      },
      null as { x: number; y: number } | null,
    ),
  );
  expect(rightmost).not.toBeNull();
  await page.keyboard.down('Control');
  await page.mouse.click(rightmost!.x, rightmost!.y);
  await page.keyboard.up('Control');
};

const expectRenderedSlur = async (page: import('@playwright/test').Page) => {
  await expect(page.locator('svg .SlurSegment').first()).toBeVisible({ timeout: 20_000 });
};

test('slur button adds a slur spanning multi-selection', async ({ page }) => {
  await loadThreeNotes(page);

  await expect(page.locator('svg .SlurSegment')).toHaveCount(0);

  await selectFirstThroughThirdNotes(page);

  await runCommand(page, 'btn-slur');
  await expectRenderedSlur(page);
});

test('S adds a slur spanning the selected notes', async ({ page }) => {
  await loadThreeNotes(page);
  await selectFirstThroughThirdNotes(page);

  await page.keyboard.press('s');
  await expectRenderedSlur(page);
});
