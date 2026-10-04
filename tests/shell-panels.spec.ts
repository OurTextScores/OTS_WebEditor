import { expect, test, type Page } from 'playwright/test';
import { runCommand, waitForCommandEnabled } from './helpers/commands';

/**
 * The Phase 3 panels (SHELL_REDESIGN_DESIGN §8.3): the left dock (Palettes, Instruments,
 * Properties), the AI Tools and Score Source panels, and the space they leave the canvas.
 */

const SCORE = '/?score=/test_scores/bach_orig.mscz';
const SINGLE_NOTE = '/?score=/test_scores/single_note_c4.musicxml';

const load = async (page: Page, url = SCORE) => {
  await page.goto(url);
  await page.waitForSelector('svg .Note', { timeout: 90_000 });
  await expect(page.getByTestId('status-bar')).toBeVisible();
};

const box = async (page: Page, testId: string) => {
  const found = await page.getByTestId(testId).boundingBox();
  if (!found) throw new Error(`${testId} has no box`);
  return found;
};

test.describe('left dock @smoke', () => {
  test('carries Palettes, Instruments and Properties, toggled by F9, F7 and F8', async ({
    page,
  }) => {
    await load(page);
    await expect(page.getByTestId('left-dock')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Palettes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('palette-search')).toBeVisible();

    await page.keyboard.press('F8');
    await expect(page.getByRole('tab', { name: 'Properties' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('inspector-panel')).toBeVisible();

    await page.keyboard.press('F7');
    await expect(page.getByTestId('instruments-panel')).toBeVisible();
    await expect(page.getByTestId('inspector-panel')).toHaveCount(0);

    // The same key closes the tab that is showing.
    await page.keyboard.press('F7');
    await expect(page.getByTestId('left-dock')).toHaveCount(0);

    await page.keyboard.press('F9');
    await expect(page.getByTestId('left-dock')).toBeVisible();
    await expect(page.getByTestId('palette-search')).toBeVisible();
  });

  test('Mod+\\ hides every panel and an edge handle brings them back', async ({ page }) => {
    await load(page);
    await page.keyboard.press('Control+\\');
    await expect(page.getByTestId('left-dock')).toHaveCount(0);
    await page.getByTestId('show-panels-handle').click();
    await expect(page.getByTestId('left-dock')).toBeVisible();
    await expect(page.getByTestId('show-panels-handle')).toHaveCount(0);
  });

  test('remembers its width across a reload', async ({ page }) => {
    await load(page);
    const handle = await box(page, 'left-dock-resize');
    const before = await box(page, 'left-dock');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 90, handle.y + handle.height / 2, { steps: 5 });
    await page.mouse.up();
    const resized = await box(page, 'left-dock');
    expect(resized.width).toBeGreaterThan(before.width + 40);

    await page.reload();
    await page.waitForSelector('svg .Note', { timeout: 90_000 });
    expect((await box(page, 'left-dock')).width).toBeCloseTo(resized.width, 0);
  });

  test('the tool strip’s Instruments button opens the dock tab rather than a second menu', async ({
    page,
  }) => {
    await load(page);
    await page.getByTestId('dropdown-instruments').click();
    await expect(page.getByTestId('instruments-panel')).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test.describe('palettes: dock and pop-out', () => {
  test('pop out, dock back, and the choice survives a reload', async ({ page }) => {
    await load(page, SINGLE_NOTE);
    await page.getByTestId('btn-palettes-pop-out').click();
    await expect(page.getByTestId('floating-palettes')).toBeVisible();
    await expect(page.getByTestId('left-dock')).toHaveCount(0);

    await page.reload();
    await page.waitForSelector('svg .Note', { timeout: 90_000 });
    // The choice is remembered: F9 opens the floating form, not the dock.
    await page.keyboard.press('F9');
    await expect(page.getByTestId('floating-palettes')).toBeVisible();
    await expect(page.getByTestId('left-dock')).toHaveCount(0);

    await page.getByTestId('btn-palettes-dock').click();
    await expect(page.getByTestId('floating-palettes')).toHaveCount(0);
    await expect(page.getByTestId('palette-search')).toBeVisible();
    await expect(page.getByTestId('left-dock')).toBeVisible();
  });

  test('a ribbon "Open … Palette" entry scopes the docked palettes to that category', async ({
    page,
  }) => {
    await load(page, SINGLE_NOTE);
    await runCommand(page, 'btn-open-clef-palette');
    await expect(page.getByTestId('palette-category-clefs')).toBeVisible();
    await expect(page.getByTestId('palette-category-dynamics')).toHaveCount(0);
    await page.getByTestId('btn-palettes-show-all').click();
    await expect(page.getByTestId('palette-category-dynamics')).toBeVisible();
  });

  for (const form of ['docked', 'floating'] as const) {
    test(`dragging a palette item onto the score applies it (${form})`, async ({ page }) => {
      await load(page, SINGLE_NOTE);
      await waitForCommandEnabled(page, 'edit.undo');
      if (form === 'floating') {
        await page.getByTestId('btn-palettes-pop-out').click();
        await expect(page.getByTestId('floating-palettes')).toBeVisible();
      }
      await page.getByTestId('palette-search').fill('mf');
      const item = page.locator('[data-testid^="palette-item-dynamic-"]').first();
      await expect(item).toBeVisible();
      await item.dragTo(page.locator('svg .Note').first());
      await expect(page.locator('svg .Dynamic')).toHaveCount(1, { timeout: 20_000 });
    });
  }
});

test.describe('instruments tab', () => {
  test('adds an instrument, hides it, and removes it after confirming', async ({ page }) => {
    await load(page, '/?score=/test_scores/three_notes_cde.musicxml');
    await page.keyboard.press('F7');
    const rows = page.locator('[data-testid^="btn-part-visible-"]');
    await expect(rows).toHaveCount(1);

    await page.getByTestId('select-instrument-add').click();
    await page.getByRole('option', { name: 'Violin', exact: true }).first().click();
    await page.getByTestId('btn-add-instrument').click();
    await expect(rows).toHaveCount(2, { timeout: 20_000 });

    const second = page.locator('[data-testid^="btn-part-visible-"]').nth(1);
    await expect(second).toHaveText('Hide');
    await second.click();
    await expect(second).toHaveText('Show', { timeout: 20_000 });

    await page.locator('[data-testid^="btn-part-remove-"]').nth(1).click();
    await expect(page.getByTestId('confirm-dialog')).toContainText('Remove');
    await page.getByTestId('dialog-confirm').click();
    await expect(rows).toHaveCount(1, { timeout: 20_000 });
  });

  test('keeps the part when the removal is declined', async ({ page }) => {
    await load(page, '/?score=/test_scores/three_notes_cde.musicxml');
    await page.keyboard.press('F7');
    await page.locator('[data-testid^="btn-part-remove-"]').first().click();
    await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[data-testid^="btn-part-visible-"]')).toHaveCount(1);
  });
});

test.describe('AI Tools and Score Source panels', () => {
  test('the AI Tools panel has a tool picker in place of tabs, and keeps its test ids', async ({
    page,
  }) => {
    await load(page, SINGLE_NOTE);
    await runCommand(page, 'ai.open.mma');
    await expect(page.getByTestId('xml-sidebar')).toBeVisible();
    await expect(page.getByTestId('tab-mma')).toHaveCount(0);
    await expect(page.getByTestId('ai-tool-picker')).toContainText('Accompaniment');

    await page.getByTestId('ai-tool-picker').click();
    for (const id of [
      'tab-ai',
      'tab-notagen',
      'tab-transcoda',
      'tab-multitrack-vae',
      'tab-harmony',
      'tab-functional-harmony',
      'tab-mma',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await page.getByTestId('tab-harmony').click();
    await expect(page.getByTestId('ai-tool-picker')).toContainText('Harmony');

    await expect(page.getByTestId('sidebar-resize-handle')).toBeVisible();
    await page.getByTestId('btn-xml-toggle').click();
    await expect(page.getByTestId('xml-sidebar')).toHaveCount(0);
  });

  test('Score Source sits beside the AI Tools panel, and there is no panel strip', async ({
    page,
  }) => {
    await load(page, SINGLE_NOTE);
    await expect(page.getByTestId('collapsed-panel-strip')).toHaveCount(0);
    await runCommand(page, 'view.panel.aiTools');
    await runCommand(page, 'view.panel.scoreSource');
    const ai = await box(page, 'xml-sidebar');
    const source = await box(page, 'musicxml-sidebar');
    // AI Tools is flush right; Score Source stacks to its left.
    expect(source.x + source.width).toBeLessThanOrEqual(ai.x + 1);
    await page.getByTestId('btn-musicxml-toggle').click();
    await expect(page.getByTestId('musicxml-sidebar')).toHaveCount(0);
  });
});

test.describe('canvas insets', () => {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ];
  const combos: { name: string; panels: string[] }[] = [
    { name: 'dock only', panels: [] },
    { name: 'dock + AI Tools', panels: ['view.panel.aiTools'] },
    {
      name: 'dock + AI Tools + Score Source',
      panels: ['view.panel.aiTools', 'view.panel.scoreSource'],
    },
  ];

  for (const viewport of viewports) {
    for (const combo of combos) {
      test(`keeps the score clear of the panels: ${combo.name} at ${viewport.width}x${viewport.height}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize(viewport);
        await load(page);
        for (const command of combo.panels) await runCommand(page, command);
        await runCommand(page, 'view.zoom.fitWidth');
        // Fit width resizes the page through a CSS transition; let it settle.
        await page.waitForTimeout(800);

        const layout = await page.getByTestId('workspace-shell').getAttribute('data-layout');
        const wrapper = await box(page, 'score-wrapper');
        const dock = await box(page, 'left-dock');
        const rightLefts = await page
          .locator('[data-testid="xml-sidebar"], [data-testid="musicxml-sidebar"]')
          .evaluateAll((els) => els.map((el) => el.closest('aside')!.getBoundingClientRect().left));
        const shell = await box(page, 'workspace-shell');

        if (layout === 'docked') {
          expect(wrapper.x, 'score starts to the right of the dock').toBeGreaterThanOrEqual(
            dock.x + dock.width - 1,
          );
          if (rightLefts.length > 0) {
            expect(
              wrapper.x + wrapper.width,
              'score ends before the right panels',
            ).toBeLessThanOrEqual(Math.min(...rightLefts) + 1);
          }
        } else {
          // Too narrow to dock: the panels float over the score, within the window and clear
          // of one another, and pressing the score gets them out of the way.
          const boxes = await page
            .locator(
              '[data-testid="left-dock"], [data-testid="xml-sidebar"], [data-testid="musicxml-sidebar"]',
            )
            .evaluateAll((els) =>
              els.map((el) => {
                const r = el.closest('aside')!.getBoundingClientRect();
                return { left: r.left, right: r.right };
              }),
            );
          for (const panel of boxes) {
            expect(panel.left).toBeGreaterThanOrEqual(shell.x - 1);
            expect(panel.right).toBeLessThanOrEqual(shell.x + shell.width + 1);
          }
          const sorted = [...boxes].sort((a, b) => a.left - b.left);
          for (let i = 1; i < sorted.length; i += 1) {
            expect(sorted[i].left, 'panels do not overlap each other').toBeGreaterThanOrEqual(
              sorted[i - 1].right - 1,
            );
          }
          await testInfo.attach(`overlay ${combo.name} ${viewport.width}x${viewport.height}`, {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
          return;
        }

        // The first note is where a click lands on the score, not on a panel.
        // Fit width now has the whole row (History no longer takes a column), so the first note
        // can sit below the fold; bring it into view before asking what is on top of it.
        await page.locator('svg .Note').first().scrollIntoViewIfNeeded();
        const note = await page.locator('svg .Note').first().boundingBox();
        expect(note).not.toBeNull();
        const hit = await page.evaluate(
          ([x, y]) => {
            const el = document.elementFromPoint(x, y);
            return (
              Boolean(el?.closest('svg')) || Boolean(el?.closest('[data-testid="score-wrapper"]'))
            );
          },
          [note!.x + note!.width / 2, note!.y + note!.height / 2],
        );
        expect(hit).toBe(true);

        await testInfo.attach(`${combo.name} ${viewport.width}x${viewport.height}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      });
    }
  }
});
