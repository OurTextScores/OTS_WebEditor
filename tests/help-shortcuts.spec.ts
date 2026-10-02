import { expect, test } from 'playwright/test';

// The help page's shortcut list is generated from the binding table (W2), so it names what the
// keys really do.
test('the help page lists the bound keys', async ({ page }) => {
  await page.goto('/help');
  const shortcuts = page.locator('#shortcuts');
  await expect(shortcuts).toContainText('Undo');
  await expect(shortcuts).toContainText('Ctrl/Cmd+Z');
  await expect(shortcuts).toContainText('Play or Pause');
  await expect(shortcuts).toContainText('Space');
  await expect(shortcuts).toContainText('Tie');
});
