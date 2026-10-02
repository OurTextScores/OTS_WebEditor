import { useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../../lib/commands/registry';
import { useCommandContext } from '../../../lib/commands/useRegisterCommands';
import type { CommandContext } from '../../../lib/commands/types';
import { invokeCommand } from '../invokeCommand';

/**
 * What a mode toolbar needs from the registry, and nothing more: whether a command is on,
 * whether a toggle is pressed, and a way to run one. Every control in a toolbar goes through
 * this, so a toolbar button and the menu item for the same command cannot disagree.
 */
export interface ToolbarCommands {
  ctx: CommandContext;
  enabled: (id: string) => boolean;
  checked: (id: string) => boolean;
  run: (id: string, arg?: unknown) => () => void;
}

export function useToolbarCommands(
  registry: CommandRegistry = defaultCommandRegistry,
): ToolbarCommands {
  const ctx = useCommandContext(registry);
  // Registered after first render; re-evaluate when the set of commands changes.
  useSyncExternalStore(
    registry.subscribe,
    () => registry.contextVersion,
    () => registry.contextVersion,
  );
  return {
    ctx,
    enabled: (id) => registry.isEnabled(id, ctx),
    checked: (id) => {
      const entry = registry.get(id) as { checked?: (c: CommandContext) => boolean } | undefined;
      return Boolean(entry?.checked?.(ctx));
    },
    run: (id, arg) => () => void invokeCommand(id, arg, registry),
  };
}
