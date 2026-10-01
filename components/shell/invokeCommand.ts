import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import type { CommandId } from '../../lib/commands/types';
import { notify } from './notices';
import { COMMAND_FORMS } from './commandForms';
import { openCommandForm } from './shellStore';

/**
 * How a menu item or palette row runs a command: ask for arguments first when the command
 * needs them and none were given, and turn a failure into a notice instead of an unhandled
 * rejection. Tests and other callers that already hold the arguments use the registry's
 * `run` directly.
 */
export async function invokeCommand(
  id: CommandId,
  arg?: unknown,
  registry: CommandRegistry = defaultCommandRegistry,
): Promise<void> {
  if (arg === undefined && COMMAND_FORMS[id]) {
    openCommandForm(id);
    return;
  }
  try {
    await registry.run(id, arg);
  } catch (error) {
    const label = (registry.get(id) as { label?: string } | undefined)?.label ?? id;
    notify({
      kind: 'error',
      title: `Unable to ${label.toLowerCase()}`,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
