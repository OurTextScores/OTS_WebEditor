import { buildEditorCommands } from '../../components/score-editor/editorCommands';
import { buildShellEditorCommands } from '../../components/score-editor/shellCommands';
import { buildShellOwnCommands } from '../../components/shell/shellCommands';
import { CommandRegistry } from '../../lib/commands/registry';
import type { AnyCommand } from '../../lib/commands/types';

/**
 * Every command the editor registers at runtime, built with inert props and bindings:
 * the ribbon adapters, the shell's own commands, and the ones backed by `ScoreEditor`.
 * For tests that care what exists, not what it does.
 */
export function allEditorCommands(): AnyCommand[] {
  return [
    ...buildEditorCommands(() => ({}) as never),
    ...buildShellEditorCommands(() => ({}) as never),
    ...buildShellOwnCommands(),
  ];
}

export function allCommandsRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register('global', allEditorCommands());
  return registry;
}
