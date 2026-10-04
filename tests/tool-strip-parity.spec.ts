import { expect, test, type Page } from 'playwright/test';
import { RIBBON_MIGRATION } from '../components/shell/ribbonMigration';

/**
 * SHELL_REDESIGN_DESIGN §23.8, made blocking at T5: every control the pre-redesign ribbon had is reachable
 * from the live tool strip. Menus and popovers are opened one by one, with a single note and then a range
 * selected (some controls need one or the other), and the test ids found in the page are collected; the
 * migration manifest's commands, containers and inputs must be among them.
 */

/** Ribbon ids that are not strip controls by design, each with where it lives now. */
const ELSEWHERE: Record<string, string> = {
  'dropdown-voice': 'the quick row shows the voice buttons directly',
  'dropdown-rhythm': 'the quick row shows the durations directly',
  'dropdown-slur-tie': 'the quick row shows Tie and Slur directly',
  'dropdown-shortcuts': 'Help ▸ Keyboard Shortcuts opens the shortcuts dialog',
  'zoom-preset-fit-width': 'the status bar zoom menu',
  'zoom-preset-fit-height': 'the status bar zoom menu',
  'btn-timesig-custom': 'the custom time signature dialog the Time menu opens',
  'input-timesig-numerator': 'the custom time signature dialog the Time menu opens',
  'input-timesig-denominator': 'the custom time signature dialog the Time menu opens',
};

/** Escape closes an open menu or popover; with none open it would clear the selection, so only press it for one. */
async function closeOpenThing(page: Page) {
  const open = await page.locator('[role="menu"], [data-radix-popper-content-wrapper]').count();
  if (open > 0) await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

async function sweep(page: Page, seen: Set<string>) {
  const collect = async () => {
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid]')].map(
        (el) => el.getAttribute('data-testid') ?? '',
      ),
    );
    for (const id of ids) seen.add(id);
  };
  await collect();
  // Every strip control that opens something. The split buttons' faces run a command, so only the chevrons.
  const openers = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="tool-strip-row"] button[data-testid]')]
      .map((el) => el.getAttribute('data-testid') ?? '')
      // The Instruments button is a command (it opens the dock tab), not a menu: opening it would move the layout.
      .filter(
        (id) =>
          (id.startsWith('dropdown-') || /-open$/.test(id)) &&
          !id.endsWith('-last') &&
          id !== 'dropdown-instruments',
      ),
  );
  expect(openers.length).toBeGreaterThan(20);
  // The quick row's dot button chooses between one and two dots on a right-click.
  await page.getByTestId('toolbar-dot').click({ button: 'right', force: true });
  await page.waitForTimeout(150);
  await collect();
  await closeOpenThing(page);
  for (const id of openers) {
    await page.getByTestId(id).click({ force: true });
    await page.waitForTimeout(150);
    await collect();
    await closeOpenThing(page);
  }
}

test('every ribbon control is reachable from the live tool strip', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 120_000 });
  const seen = new Set<string>();

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor();
  await sweep(page, seen);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(300);
  await sweep(page, seen);

  // The Instruments button opens the dock tab that holds the part controls.
  await page.getByTestId('dropdown-instruments').click();
  await page.waitForTimeout(300);
  for (const id of await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid]')].map(
      (el) => el.getAttribute('data-testid') ?? '',
    ),
  ))
    seen.add(id);

  const wanted = RIBBON_MIGRATION.filter(
    (entry) =>
      entry.legacyLocation.startsWith('Ribbon') &&
      !['decoration', 'option'].includes(entry.kind ?? 'command'),
  );
  expect(wanted.length).toBeGreaterThan(100);
  const missing = wanted
    .filter((entry) => !(entry.legacyTestId in ELSEWHERE))
    .filter((entry) =>
      entry.prefix
        ? ![...seen].some((id) => id.startsWith(entry.legacyTestId))
        : !seen.has(entry.legacyTestId),
    )
    .map((entry) => entry.legacyTestId);
  expect(missing).toEqual([]);
});
