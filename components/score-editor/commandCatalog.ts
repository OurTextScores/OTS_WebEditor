import type { AnyCommand } from '../../lib/commands/types';
import { buildShellOwnCommands, buildStatusBarCommands } from '../shell/shellCommands';
import { buildEditorCommands } from './editorCommands';
import { buildShellEditorCommands } from './shellCommands';

/**
 * Every command the editor registers, built with inert props: the definitions only, for code
 * that needs to know what exists and what it is called (the shortcut list, the help page,
 * the generated shortcut document, tests), not what it does.
 */
export function buildCommandCatalog(): AnyCommand[] {
  return [
    ...buildEditorCommands(() => ({}) as never),
    ...buildShellEditorCommands(() => ({}) as never),
    ...buildShellOwnCommands(),
    ...buildStatusBarCommands(),
  ];
}
