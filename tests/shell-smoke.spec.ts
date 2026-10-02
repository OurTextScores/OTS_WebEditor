import { expect, test } from 'playwright/test';
import type { BrowserScoreWindow } from './browser-score-types';
import { openMenuPath, runCommand } from './helpers/commands';

/**
 * The Phase 1 shell: header, complete menu bar, command palette and the shortcuts they own
 * (SHELL_REDESIGN_DESIGN §4.1, §8.1, §8.5). Tagged @smoke.
 */

const SCORE = '/?score=/test_scores/three_notes_cde.musicxml';

test.describe('shell menus and palette @smoke', () => {
  test('every top menu opens and is not empty', async ({ page }) => {
    await page.goto(SCORE);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('menubar')).toBeVisible();

    for (const menu of ['file', 'edit', 'view', 'add', 'format', 'tools', 'help']) {
      await page.getByTestId(`menu-${menu}`).click();
      await expect(page.getByRole('menu').first()).toBeVisible();
      expect(await page.getByRole('menuitem').count(), menu).toBeGreaterThan(0);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
    }
  });

  test('the palette finds Export PDF and runs it', async ({ page }) => {
    await page.goto(SCORE);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });

    await page.keyboard.press('Control+Shift+P');
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await page.getByTestId('palette-input').fill('export pdf');
    await expect(page.getByTestId('palette-row').first()).toContainText('Export PDF');

    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.keyboard.press('Enter');
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/i);
    await expect(page.getByTestId('command-palette')).toBeHidden();
  });

  test('a menu path runs the command: Add ▸ Signatures ▸ Key ▸ D', async ({ page }) => {
    await page.goto('/?score=/test_scores/bach_orig.mscz');
    await page.waitForSelector('svg .Clef', { timeout: 60_000 });
    const readKey = () =>
      page.evaluate(async () =>
        Number(await (window as BrowserScoreWindow).__webmscore!.getKeySignature!()),
      );
    const initial = await readKey();
    // D major is two sharps; pick the other one if that is where the score starts.
    const target = initial === 2 ? 1 : 2;
    const label = target === 2 ? 'D' : 'G';

    await openMenuPath(page, ['Add', 'Signatures', 'Key', label]);
    await expect.poll(readKey, { timeout: 20_000 }).toBe(target);
  });

  test('a command that needs arguments asks for them', async ({ page }) => {
    await page.goto(SCORE);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    const measureCount = () =>
      page.evaluate(async () => {
        const positions = await (window as BrowserScoreWindow).__webmscore!.measurePositions!();
        return positions.elements.length;
      });
    const before = await measureCount();

    await openMenuPath(page, ['Add', 'Measures', 'Insert Measures']);
    await expect(page.getByTestId('command-form')).toBeVisible();
    await page.getByTestId('input-measure-count').fill('2');
    await page.getByTestId('select-measure-target').selectOption('end');
    await page.getByTestId('btn-insert-measures').click();
    await expect.poll(measureCount, { timeout: 20_000 }).toBe(before + 2);
  });

  test('F8 toggles the Properties panel and Mod+\\ hides every panel', async ({ page }) => {
    await page.goto(SCORE);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });

    await expect(page.getByTestId('inspector-panel')).toHaveCount(0);
    await page.keyboard.press('F8');
    await expect(page.getByTestId('inspector-panel')).toBeVisible();
    await page.keyboard.press('F8');
    await expect(page.getByTestId('inspector-panel')).toHaveCount(0);

    // The same key closes the tab it shows, and the dock with it.
    await expect(page.getByTestId('left-dock')).toHaveCount(0);
    await page.keyboard.press('F9');
    await expect(page.getByTestId('left-dock')).toBeVisible();
    await page.keyboard.press('Control+\\');
    await expect(page.getByTestId('left-dock')).toHaveCount(0);
    // Opening a panel while all are hidden brings them back.
    await page.keyboard.press('F8');
    await expect(page.getByTestId('inspector-panel')).toBeVisible();
    await expect(page.getByTestId('left-dock')).toBeVisible();
  });

  test('Mod+S saves a checkpoint, and Open Recent lists the score', async ({ page }) => {
    await page.goto(SCORE);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    page.on('dialog', (dialog) => void dialog.dismiss());

    await page.getByTestId('activity-history').click();
    await page.getByTestId('input-checkpoint-label').fill('Shell smoke');
    await page.keyboard.press('Escape'); // leave the field; Mod+S must work from the canvas
    await page.locator('svg .Note').first().click();
    await page.keyboard.press('Control+s');
    await expect(page.locator('[data-testid^="btn-checkpoint-compare-"]').first()).toBeVisible({
      timeout: 15_000,
    });

    await openMenuPath(page, ['File', 'Open Recent']);
    await expect(page.getByTestId('menu-item-recent-score').first()).toBeVisible();
  });

  test('Help ▸ Keyboard Shortcuts lists the shell’s keys', async ({ page }) => {
    await page.goto(SCORE);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await openMenuPath(page, ['Help', 'Keyboard Shortcuts']);
    const dialog = page.getByTestId('shortcuts-dialog');
    await expect(dialog).toContainText('Command Palette');
    await expect(dialog).toContainText('Slur');
  });

  test('a menu item shows its availability: undo is off until something changed', async ({
    page,
  }) => {
    await page.goto(SCORE);
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await page.getByTestId('menu-edit').click();
    // Pitch Up needs a selection.
    await page.getByRole('menuitem', { name: 'Pitch' }).hover();
    await expect(page.getByTestId('menu-item-edit.pitch.up')).toHaveAttribute('data-disabled', '');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await page.locator('svg .Note').first().click();
    await page.getByTestId('menu-edit').click();
    await page.getByRole('menuitem', { name: 'Pitch' }).hover();
    await expect(page.getByTestId('menu-item-edit.pitch.up')).not.toHaveAttribute(
      'data-disabled',
      '',
    );
  });

  test('host surfaces have no shell chrome', async ({ page }) => {
    await page.goto('/?compareLeft=/sample-left.xml&compareRight=/sample-right.xml');
    await expect(page.getByTestId('checkpoint-compare-modal')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('shell-header')).toHaveCount(0);
    await expect(page.getByRole('menubar')).toHaveCount(0);
  });
});

test.describe('go to', () => {
  test('m<N> in the palette moves to the page the bar is on', async ({ page }) => {
    await page.goto('/?score=/test_scores/bach_orig.mscz');
    await page.waitForSelector('svg .Clef', { timeout: 60_000 });

    const pages = await page.getByTestId('page-select').locator('option').count();
    test.skip(pages < 2, 'needs a multi-page score');
    const { lastBar, lastPage } = await page.evaluate(async () => {
      const positions = await (window as BrowserScoreWindow).__webmscore!.measurePositions!();
      const last = positions.elements.length - 1;
      return { lastBar: last + 1, lastPage: positions.elements[last].page };
    });
    expect(lastPage).toBeGreaterThan(0);

    await page.keyboard.press('Control+f');
    await page.getByTestId('palette-input').fill(String(lastBar));
    await expect(page.getByTestId('palette-navigate')).toContainText(`bar ${lastBar}`);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('page-select')).toHaveValue(String(lastPage));
  });

  test('p<N> goes to that page, and runCommand reaches the same place', async ({ page }) => {
    await page.goto('/?score=/test_scores/bach_orig.mscz');
    await page.waitForSelector('svg .Clef', { timeout: 60_000 });
    const pages = await page.getByTestId('page-select').locator('option').count();
    test.skip(pages < 2, 'needs a multi-page score');

    await page.keyboard.press('Control+Shift+P');
    await page.getByTestId('palette-input').fill('p2');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('page-select')).toHaveValue('1');

    await runCommand(page, 'view.goto.page', 1);
    await expect(page.getByTestId('page-select')).toHaveValue('0');
  });
});
