import { buildCommandCatalog } from '../../components/score-editor/commandCatalog';
import { CommandRegistry } from '../../lib/commands/registry';
import type { AnyCommand } from '../../lib/commands/types';

/** Every command the editor registers at runtime, with inert props and bindings. */
export function allEditorCommands(): AnyCommand[] {
  return buildCommandCatalog();
}

export function allCommandsRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register('global', allEditorCommands());
  return registry;
}
