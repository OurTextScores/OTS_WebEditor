import { expect, test } from '@playwright/test';
import { runCommand } from './helpers/commands';

test('a screen reader hears the selection, the edit and the mode switch', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const announcer = page.getByTestId('announcer');

  // Polite and atomic, and silent until something happens.
  await expect(announcer).toHaveAttribute('aria-live', 'polite');
  await expect(announcer).toHaveText('');

  await page.locator('svg .Note').first().click();
  await expect(announcer).toHaveText('Note selected.', { timeout: 10_000 });

  await runCommand(page, 'btn-pitch-up');
  await expect(announcer).toHaveText('Raise pitch.', { timeout: 20_000 });

  await page.getByTestId('activity-history').click();
  await expect(announcer).toHaveText('History mode.');
});

test('keyboard focus is drawn on a control that has no ring of its own', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  // The page selector in the status bar is a plain <select>.
  await page.keyboard.press('Tab');
  await page.getByTestId('page-select').focus();
  const outline = await page.getByTestId('page-select').evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline).toEqual({ style: 'solid', width: '2px' });
});
