import type { AnyCommand } from '../../lib/commands/types';
import { buildShellOwnCommands, buildStatusBarCommands } from '../shell/shellCommands';
// Not the chord-selection or parts barrels: they export hooks, and the server-rendered Help page reads this catalog.
import { buildChordSelectionCommands } from './chord-selection/chordSelectionCommands';
import { buildContextMenuCommands } from './contextMenuCommands';
import { buildNotationMarkCommands } from './notationMarkCommands';
import { buildEditorCommands } from './editorCommands';
import { buildPartCommands } from './parts/partCommands';
import { buildShellEditorCommands } from './shellCommands';

/**
 * Every command the editor registers, built with inert props: the definitions only, for code
 * that needs to know what exists and what it is called (the shortcut list, the help page,
 * the generated shortcut document, tests), not what it does.
 */
export function buildCommandCatalog(): AnyCommand[] {
  return [
    ...buildEditorCommands(() => ({}) as never),
    ...buildContextMenuCommands(() => ({}) as never),
    ...buildNotationMarkCommands(() => ({}) as never),
    ...buildShellEditorCommands(() => ({}) as never),
    ...buildShellOwnCommands(),
    ...buildStatusBarCommands(),
    ...buildPartCommands(() => ({}) as never),
    ...buildChordSelectionCommands(() => ({}) as never),
  ];
}
