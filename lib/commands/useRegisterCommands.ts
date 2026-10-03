import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from './registry';
import {
  isCommandFamily,
  type AnyCommand,
  type Command,
  type CommandContext,
  type CommandFamily,
  type CommandId,
  type CommandScope,
  type Enabled,
} from './types';
import { installCommandTestHook } from './testHook';

type LooseCommand = Command<unknown>;
type LooseFamily = CommandFamily<unknown>;

/**
 * Registers `commands` for the lifetime of the calling component and keeps their `run`,
 * `enabled`, `visible` and `checked` closures current without re-registering.
 *
 * Callers build the list inline, so it is a new array (with new closures over the latest
 * handlers) on every render. Registering that directly would churn the registry and wake
 * every subscriber each render. Instead the registry holds stable wrappers that look the
 * latest entry up by id, and re-registration happens only when the *set of ids* changes.
 * Static metadata (label, variants, test ids) is read at registration time.
 */
export function useRegisterCommands(
  scope: CommandScope,
  commands: readonly AnyCommand[],
  registry: CommandRegistry = defaultCommandRegistry,
): void {
  const latest = useRef<ReadonlyMap<CommandId, AnyCommand>>(new Map());

  // Declared before the registration effect below: layout effects run first, so a command
  // run straight after commit sees this render's closures, and the registration effect
  // reads this render's entries from the same map.
  useLayoutEffect(() => {
    latest.current = new Map(commands.map((entry) => [entry.id, entry]));
  });

  const signature = commands.map((entry) => entry.id).join('\n');
  useEffect(() => {
    // `signature` is the dependency on purpose: it is the identity of the id set.
    const stable = [...latest.current.values()].map((entry) => wrap(entry, latest));
    return registry.register(scope, stable);
  }, [registry, scope, signature]);
}

/**
 * A stable `enabled` that asks the latest entry, and passes on that entry's `unmet` reason: a gate's
 * explanation lives on the function, so a wrapper that only forwards the call would lose it.
 */
function liveEnabled(live: () => { enabled?: Enabled }): Enabled {
  return Object.assign((ctx: CommandContext) => live().enabled?.(ctx) ?? true, {
    unmet: (ctx: CommandContext) => live().enabled?.unmet?.(ctx),
  });
}

function wrap(
  entry: AnyCommand,
  latest: { current: ReadonlyMap<CommandId, AnyCommand> },
): AnyCommand {
  const current = () => latest.current.get(entry.id) ?? entry;
  if (isCommandFamily(entry)) {
    const family = entry as unknown as LooseFamily;
    const live = () => current() as unknown as LooseFamily;
    const wrapped: LooseFamily = {
      ...family,
      enabled: liveEnabled(live),
      run: (ctx, arg) => live().run(ctx, arg),
      ...(family.checked
        ? { checked: (ctx: CommandContext, arg: unknown) => live().checked?.(ctx, arg) ?? false }
        : {}),
    };
    return wrapped as unknown as AnyCommand;
  }
  const command = entry as unknown as LooseCommand;
  const live = () => current() as unknown as LooseCommand;
  const wrapped: LooseCommand = {
    ...command,
    enabled: liveEnabled(live),
    visible: (ctx) => live().visible?.(ctx) ?? true,
    run: (ctx, args) => live().run(ctx, args),
    ...(command.checked
      ? { checked: (ctx: CommandContext) => live().checked?.(ctx) ?? false }
      : {}),
  };
  return wrapped as unknown as AnyCommand;
}

const sameContext = (a: CommandContext, b: CommandContext) =>
  (Object.keys(a) as (keyof CommandContext)[]).every((key) => a[key] === b[key]);

/**
 * Makes `context` the registry's live context. When any field changes it bumps the
 * registry's `contextVersion` so open surfaces re-evaluate `enabled` / `checked`; the
 * evaluation itself stays lazy. Also installs the Playwright hook in non-production builds.
 */
export function useProvideCommandContext(
  context: CommandContext,
  registry: CommandRegistry = defaultCommandRegistry,
): void {
  const ref = useRef(context);

  useEffect(() => {
    const remove = registry.setContextSource(() => ref.current);
    const removeHook = installCommandTestHook(registry);
    return () => {
      remove();
      removeHook();
    };
  }, [registry]);

  useEffect(() => {
    const previous = ref.current;
    ref.current = context;
    if (!sameContext(previous, context)) registry.invalidate();
  }, [context, registry]);
}

/**
 * The live context, for surfaces that render `enabled` / `checked`. Re-renders only when
 * the registry's `contextVersion` moves.
 */
export function useCommandContext(
  registry: CommandRegistry = defaultCommandRegistry,
): CommandContext {
  useSyncExternalStore(
    registry.subscribe,
    () => registry.contextVersion,
    () => registry.contextVersion,
  );
  return registry.getContext();
}
