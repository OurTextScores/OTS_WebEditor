import { expect, test, type Page } from 'playwright/test';
import { runCommand } from './helpers/commands';

async function open(page: Page) {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
}

const commandState = (page: Page, id: string) =>
  page.evaluate(
    (commandId) =>
      (
        window as unknown as {
          __otsCommands: {
            list: () => { id: string; enabled: boolean; disabledReason?: string }[];
          };
        }
      ).__otsCommands
        .list()
        .find((command) => command.id === commandId),
    id,
  );

test('Undo and Redo are off on a fresh score and say why, and follow the engine’s undo stack', async ({
  page,
}) => {
  await open(page);
  await expect.poll(async () => (await commandState(page, 'edit.undo'))?.enabled).toBe(false);
  expect((await commandState(page, 'edit.undo'))?.disabledReason).toBe('Nothing to undo');
  expect((await commandState(page, 'edit.redo'))?.disabledReason).toBe('Nothing to redo');

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor();
  await runCommand(page, 'edit.pitch.up');
  await expect.poll(async () => (await commandState(page, 'edit.undo'))?.enabled).toBe(true);
  expect((await commandState(page, 'edit.redo'))?.enabled).toBe(false);

  await runCommand(page, 'edit.undo');
  await expect.poll(async () => (await commandState(page, 'edit.undo'))?.enabled).toBe(false);
  await expect.poll(async () => (await commandState(page, 'edit.redo'))?.enabled).toBe(true);

  await runCommand(page, 'edit.redo');
  await expect.poll(async () => (await commandState(page, 'edit.redo'))?.enabled).toBe(false);
  await expect.poll(async () => (await commandState(page, 'edit.undo'))?.enabled).toBe(true);
});

test('Ctrl+Z straight after an edit still undoes it', async ({ page }) => {
  await open(page);
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor();
  await runCommand(page, 'edit.pitch.up');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await commandState(page, 'edit.undo'))?.enabled).toBe(false);
  await expect.poll(async () => (await commandState(page, 'edit.redo'))?.enabled).toBe(true);
});

const rows = (page: Page) =>
  page
    .getByRole('list', { name: /newest first/i })
    .getByRole('button')
    .allTextContents();

test('the Edits tab lists the edits, jumps to any of them, and a new edit after a jump drops the rest', async ({
  page,
}) => {
  await open(page);
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor();
  const xml = () =>
    page.evaluate(async () =>
      (
        window as unknown as { __webmscore: { saveXml: () => Promise<string> } }
      ).__webmscore.saveXml(),
    );
  const original = await xml();

  await runCommand(page, 'view.panel.undoHistory');
  await expect(page.getByTestId('edits-empty')).toBeVisible();

  await runCommand(page, 'edit.pitch.up');
  await runCommand(page, 'add.mark.dynamic', 8);
  await runCommand(page, 'add.mark.articulation', 'articAccentAbove');
  await expect
    .poll(() => rows(page))
    .toEqual(['Add accent', 'Add dynamic', 'Raise pitch', 'Original']);
  await expect(page.getByTestId('edit-row-3')).toHaveAttribute('aria-current', 'step');
  const afterThree = await xml();
  expect(afterThree).not.toBe(original);

  // Back two edits at once.
  await page.getByTestId('edit-row-1').click();
  await expect(page.getByTestId('edit-row-1')).toHaveAttribute('aria-current', 'step');
  await expect.poll(async () => (await xml()).includes('<dynamics>')).toBe(false);
  expect(await rows(page)).toEqual(['Add accent', 'Add dynamic', 'Raise pitch', 'Original']);
  await expect(page.getByTestId('edits-redo')).toBeEnabled();

  // All the way back, then forward again to the last edit.
  await page.getByTestId('edit-row-0').click();
  await expect.poll(xml).toBe(original);
  await expect(page.getByTestId('edits-undo')).toBeDisabled();
  await page.getByTestId('edit-row-3').click();
  await expect.poll(xml).toBe(afterThree);

  // A new edit from the middle drops what was ahead.
  await page.getByTestId('edit-row-1').click();
  await expect(page.getByTestId('edit-row-1')).toHaveAttribute('aria-current', 'step');
  await runCommand(page, 'add.line.slur');
  await expect.poll(() => rows(page)).toEqual(['Add slur', 'Raise pitch', 'Original']);
  await expect(page.getByTestId('edits-redo')).toBeDisabled();
});

test('the Undo and Redo buttons in the Edits tab work', async ({ page }) => {
  await open(page);
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor();
  await runCommand(page, 'view.panel.undoHistory');
  await runCommand(page, 'edit.pitch.up');
  await expect(page.getByTestId('edits-undo')).toBeEnabled();
  await page.getByTestId('edits-undo').click();
  await expect(page.getByTestId('edit-row-0')).toHaveAttribute('aria-current', 'step');
  await page.getByTestId('edits-redo').click();
  await expect(page.getByTestId('edit-row-1')).toHaveAttribute('aria-current', 'step');
});
