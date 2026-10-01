import { expect, test } from 'playwright/test';
import { resolveCommandReference, runCommand } from './helpers/commands';

type ScoreWindow = typeof window & {
  __webmscore?: { saveMsc?: (format: 'mscx') => Promise<Uint8Array> };
};

/**
 * The command layer against the real editor: the registry is populated by the ribbon, the
 * test hook works, and a command runs the same handler the button does.
 */
test.describe('commands (SHELL_REDESIGN Phase 0)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
  });

  test('the ribbon registers its actions and exposes them to tests', async ({ page }) => {
    await page.waitForFunction(() =>
      Boolean((window as never as { __otsCommands?: unknown }).__otsCommands),
    );
    const ids = await page.evaluate(() =>
      (window as never as { __otsCommands: { list(): { id: string }[] } }).__otsCommands
        .list()
        .map((entry) => entry.id),
    );
    expect(ids.length).toBeGreaterThan(100);
    expect(ids).toEqual(
      expect.arrayContaining(['file.export.pdf', 'edit.undo', 'add.clef', 'view.zoom.in']),
    );
  });

  test('a command and its ribbon button have the same effect', async ({ page }) => {
    const zoomLabel = page.getByTestId('zoom-preset-trigger');
    const before = await zoomLabel.innerText();

    await runCommand(page, 'view.zoom.in');
    await expect(zoomLabel).not.toHaveText(before);
    const viaCommand = await zoomLabel.innerText();

    // Back to where we started, then the same change through the button.
    await runCommand(page, 'btn-zoom-out');
    await expect(zoomLabel).toHaveText(before);
    await page.getByTestId('btn-zoom-in').click();
    await expect(zoomLabel).toHaveText(viaCommand);
  });

  test('a legacy test id resolves through the manifest, with its argument', async ({ page }) => {
    expect(resolveCommandReference('btn-clef-20')).toEqual({ commandId: 'add.clef', args: 20 });

    const readClefs = () =>
      page.evaluate(async () => {
        const data = await (window as ScoreWindow).__webmscore!.saveMsc!('mscx');
        return (
          new TextDecoder()
            .decode(data)
            .match(/<concertClefType>[^<]*</g)
            ?.join('') ?? ''
        );
      });
    const before = await readClefs();

    await page.locator('svg .Note').first().click();
    await runCommand(page, 'btn-clef-20');
    await expect.poll(readClefs, { timeout: 15_000 }).not.toBe(before);
  });

  test('says why when a command is not available', async ({ page }) => {
    // Nothing is selected, so a selection-bound command stays disabled.
    await expect(runCommand(page, 'add.line.slur', undefined, { timeout: 500 })).rejects.toThrow(
      /registered but was not enabled/,
    );
    await expect(runCommand(page, 'no.such.command', undefined, { timeout: 500 })).rejects.toThrow(
      /was not registered/,
    );
  });

  test('a failed mutation raises a toast instead of a blocking dialog', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    await page.locator('svg .Note').first().click();
    // Make the next mutation throw inside performMutation's action.
    await page.evaluate(() => {
      const score = (window as never as { __webmscore: Record<string, unknown> }).__webmscore;
      score.pitchUp = () => {
        throw new Error('forced failure');
      };
      score.pitchUpOctave = score.pitchUp;
    });
    await page.keyboard.press('ArrowUp');
    // Next's route announcer is also role=alert, so address the toast by its test id.
    await expect(page.getByTestId('notice-error')).toContainText('Unable to', { timeout: 10_000 });
    expect(dialogs).toBe(0);
  });
});
