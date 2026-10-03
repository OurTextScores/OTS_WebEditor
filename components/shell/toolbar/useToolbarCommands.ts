import { useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../../lib/commands/registry';
import { useCommandContext } from '../../../lib/commands/useRegisterCommands';
import { primaryShortcut } from '../../../lib/commands/bindings';
import { unmetReason, type CommandContext } from '../../../lib/commands/types';
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
  /** A family variant's pressed state (the selection filter's bits). */
  checkedFor: (id: string, arg: unknown) => boolean;
  /** Whether the command is a toggle (has a pressed state at all). */
  toggles: (id: string) => boolean;
  /** Why the command is unavailable right now, when it says. */
  reason: (id: string) => string | undefined;
  /** The command's primary key binding, in the registry's grammar. */
  shortcut: (id: string, arg?: unknown) => string | undefined;
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
    checkedFor: (id, arg) => {
      const entry = registry.get(id) as
        { checked?: (c: CommandContext, a: unknown) => boolean } | undefined;
      return Boolean(entry?.checked?.(ctx, arg));
    },
    toggles: (id) => Boolean((registry.get(id) as { checked?: unknown } | undefined)?.checked),
    reason: (id) =>
      unmetReason((registry.get(id) as { enabled?: never } | undefined)?.enabled, ctx),
    shortcut: (id, arg) => primaryShortcut(id, arg),
    run: (id, arg) => () => void invokeCommand(id, arg, registry),
  };
}
