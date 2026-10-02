import type { Page } from 'playwright/test';
import { resolveLegacyTestId } from '../../components/shell/ribbonMigration';

/**
 * Runs editor commands by id, so a spec does not care which surface (ribbon today, menu bar
 * or palette later) currently hosts the control. SHELL_REDESIGN_DESIGN §11.
 *
 * Needs a non-production build: `window.__otsCommands` is not exposed in production.
 */

interface CommandsHook {
  run(id: string, args?: unknown): Promise<'ran' | 'disabled'>;
  list(): { id: string; enabled: boolean }[];
}
type CommandsWindow = typeof window & { __otsCommands?: CommandsHook };

export interface RunCommandOptions {
  /** How long to wait for the command to be registered and enabled. */
  timeout?: number;
}

/**
 * A command id (`file.export.pdf`) or a legacy test id (`btn-export-pdf`). Command ids
 * contain a dot; legacy test ids never do. Legacy ids resolve through the migration
 * manifest, including a family variant's argument (`btn-clef-20` -> `add.clef`, 20).
 */
export function resolveCommandReference(
  idOrLegacyTestId: string,
  args?: unknown,
): { commandId: string; args: unknown } {
  if (idOrLegacyTestId.includes('.')) return { commandId: idOrLegacyTestId, args };

  const resolved = resolveLegacyTestId(idOrLegacyTestId);
  if (!resolved) {
    throw new Error(
      `"${idOrLegacyTestId}" is neither a command id nor a legacy test id in the migration manifest.`,
    );
  }
  if (!resolved.commandId) {
    throw new Error(
      `"${idOrLegacyTestId}" is ${resolved.entry.kind ?? 'a control'} that does not run a command; ` +
        `it moved to: ${resolved.entry.newHome}.`,
    );
  }
  return { commandId: resolved.commandId, args: args ?? resolved.arg };
}

/**
 * Waits until the command is registered and enabled, then runs it. Waiting for enabled
 * matches what clicking the ribbon button did: Playwright waits for a button to be enabled,
 * and a command that is not enabled yet is usually still catching up with the editor.
 * Throws if it never becomes available, naming which of the two it was.
 */
export async function runCommand(
  page: Page,
  idOrLegacyTestId: string,
  args?: unknown,
  { timeout = 10_000 }: RunCommandOptions = {},
): Promise<void> {
  const { commandId, args: commandArgs } = resolveCommandReference(idOrLegacyTestId, args);

  try {
    await page.waitForFunction(
      (id) =>
        (window as CommandsWindow).__otsCommands?.list().some((c) => c.id === id && c.enabled) ??
        false,
      commandId,
      { timeout },
    );
  } catch {
    const known = await page.evaluate(
      (id) => (window as CommandsWindow).__otsCommands?.list().find((c) => c.id === id),
      commandId,
    );
    throw new Error(
      known?.enabled
        ? // The command is available now: the page was too busy to answer within the timeout.
          `Command "${commandId}" is enabled, but the page did not report it within ${timeout}ms.`
        : known
          ? `Command "${commandId}" is registered but was not enabled within ${timeout}ms.`
          : `Command "${commandId}" was not registered within ${timeout}ms ` +
            '(is window.__otsCommands available? It is absent in production builds).',
    );
  }

  const status = await page.evaluate(
    ({ id, argument }) => (window as CommandsWindow).__otsCommands!.run(id, argument),
    { id: commandId, argument: commandArgs },
  );
  if (status !== 'ran') {
    throw new Error(`Command "${commandId}" did not run: ${status}.`);
  }
}

/**
 * Runs a command that asks for text (the Text menu entries, the header text editor) and
 * answers its prompt. A prompt is a dialog the command awaits, so the run cannot be awaited
 * until the dialog is answered. Returns the text the prompt was pre-filled with; `null`
 * cancels it.
 */
export async function runCommandAnsweringPrompt(
  page: Page,
  idOrLegacyTestId: string,
  answer: string | null,
  args?: unknown,
): Promise<string> {
  const run = runCommand(page, idOrLegacyTestId, args);
  const input = page.getByTestId('prompt-dialog-input');
  await input.waitFor({ timeout: 10_000 });
  const prefilled = await input.inputValue();
  if (answer === null) {
    await page.getByTestId('prompt-dialog').getByRole('button', { name: 'Cancel' }).click();
  } else {
    await input.fill(answer);
    await page.getByTestId('dialog-confirm').click();
  }
  await run;
  return prefilled;
}

/**
 * Waits until a command is enabled, without running it. For specs that used a ribbon
 * control's enabled state as the signal that a selection had reached the engine.
 */
export async function waitForCommandEnabled(
  page: Page,
  idOrLegacyTestId: string,
  { timeout = 20_000 }: RunCommandOptions = {},
): Promise<void> {
  const { commandId } = resolveCommandReference(idOrLegacyTestId);
  await page.waitForFunction(
    (id) =>
      (window as CommandsWindow).__otsCommands?.list().some((c) => c.id === id && c.enabled) ??
      false,
    commandId,
    { timeout },
  );
}

/**
 * Opens a menu path through the UI, for specs that must exercise the menu itself rather
 * than the command: `openMenuPath(page, ['File', 'Export', 'PDF'])`.
 *
 * Targets the Phase 1 menu bar: each top-level trigger carries `data-testid="menu-<name>"`
 * (lower-cased) and the items are Radix menu items located by accessible name. It cannot
 * work before that menu bar exists.
 */
export async function openMenuPath(page: Page, path: readonly string[]): Promise<void> {
  if (path.length < 2) throw new Error('A menu path needs a menu and at least one item.');
  const [menu, ...items] = path;
  await page.getByTestId(`menu-${menu.toLowerCase()}`).click();
  for (const [index, name] of items.entries()) {
    // The label, then end of name or whitespace: a menu appends "…" for dialogs and the
    // shortcut after a space, and a short label ("D") must not match "Dynamics".
    const label = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}…?(\\s|$)`);
    const item = page.getByRole('menuitem', { name: label }).first();
    if (index < items.length - 1) await item.hover();
    else await item.click();
  }
}
