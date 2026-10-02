import { expect, test } from 'playwright/test';
import { RIBBON_MIGRATION } from '../components/shell/ribbonMigration';

/**
 * SHELL_REDESIGN_DESIGN Phase 5 asks for a walkthrough of every manifest entry. Clicking a
 * hundred and seventy controls by hand proves less than asking the running editor, so this
 * does the part a script can: every command the manifest names is registered in the live
 * app, and every one of its top-level menus opens. What it cannot tell is whether a command
 * *does* the right thing; the per-feature specs cover that.
 */
test('every command the migration manifest names is registered in the running editor', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.waitForFunction(
    () =>
      ((window as unknown as { __otsCommands?: { list(): unknown[] } }).__otsCommands?.list()
        .length ?? 0) > 100,
    undefined,
    { timeout: 30_000 },
  );

  const registered = await page.evaluate(() =>
    (window as unknown as { __otsCommands: { list(): { id: string }[] } }).__otsCommands
      .list()
      .map((entry) => entry.id),
  );
  const named = new Set(
    RIBBON_MIGRATION.filter((entry) => entry.commandId).map((entry) => entry.commandId as string),
  );
  expect(named.size).toBeGreaterThan(100);
  expect([...named].filter((id) => !registered.includes(id))).toEqual([]);
});

test('every top menu opens and holds something', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  for (const menu of ['file', 'edit', 'view', 'add', 'format', 'tools', 'help']) {
    await page.getByTestId(`menu-${menu}`).click();
    await expect(page.getByRole('menuitem').first()).toBeVisible();
    await page.keyboard.press('Escape');
  }
});
