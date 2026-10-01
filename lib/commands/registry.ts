import {
  isCommandFamily,
  type AnyCommand,
  type Command,
  type CommandContext,
  type CommandDescriptor,
  type CommandFamily,
  type CommandId,
  type CommandScope,
  type RunStatus,
} from './types';

export const DEFAULT_COMMAND_CONTEXT: CommandContext = {
  mode: 'write',
  hasScore: false,
  selection: 'none',
  noteInput: false,
  canUndo: false,
  canRedo: false,
  aiEnabled: false,
  isMutable: false,
};

interface Registration {
  readonly entry: AnyCommand;
  readonly scope: CommandScope;
}

export class UnknownCommandError extends Error {
  constructor(readonly commandId: CommandId) {
    super(`Unknown command "${commandId}".`);
    this.name = 'UnknownCommandError';
  }
}

const isDevelopment = () => process.env.NODE_ENV !== 'production';

/**
 * The single place behaviour is looked up (SHELL_REDESIGN_DESIGN §5.2).
 *
 * Menus, the palette, toolbars, shortcuts and tests are all views of this registry and
 * reach behaviour only through `run`. It does not change `performMutation` or
 * `runSerializedScoreOperation`: a command's `run` calls the same editor handlers the
 * ribbon always has.
 */
export class CommandRegistry {
  private readonly registrations = new Map<CommandId, Registration>();
  private readonly listeners = new Set<() => void>();
  private contextSource: (() => CommandContext) | null = null;
  private version = 0;

  /**
   * Registers `entries` under `scope` and returns the function that removes exactly those
   * entries. A duplicate id throws in development; in production the later registration
   * wins so one bad mount cannot take the editor down.
   */
  register(scope: CommandScope, entries: readonly AnyCommand[]): () => void {
    const added: AnyCommand[] = [];
    for (const entry of entries) {
      const existing = this.registrations.get(entry.id);
      if (existing) {
        if (isDevelopment()) {
          // Roll back what this call already added so a throw leaves no half-registration.
          for (const done of added) this.registrations.delete(done.id);
          throw new Error(`Command "${entry.id}" is already registered (scope ${existing.scope}).`);
        }
        console.warn(`Command "${entry.id}" registered twice; the later registration wins.`);
      }
      this.registrations.set(entry.id, { entry, scope });
      added.push(entry);
    }
    this.invalidate();
    return () => {
      let removed = false;
      for (const entry of added) {
        // Only remove what is still ours: a later registration may have replaced it.
        if (this.registrations.get(entry.id)?.entry === entry) {
          this.registrations.delete(entry.id);
          removed = true;
        }
      }
      if (removed) this.invalidate();
    };
  }

  has(id: CommandId): boolean {
    return this.registrations.has(id);
  }

  get(id: CommandId): AnyCommand | undefined {
    return this.registrations.get(id)?.entry;
  }

  ids(): CommandId[] {
    return [...this.registrations.keys()];
  }

  /** The current context; falls back to an inert one before an editor has supplied it. */
  getContext(): CommandContext {
    return this.contextSource ? this.contextSource() : DEFAULT_COMMAND_CONTEXT;
  }

  /** Installs the live context source; the returned function removes it (if still current). */
  setContextSource(source: () => CommandContext): () => void {
    this.contextSource = source;
    this.invalidate();
    return () => {
      if (this.contextSource === source) {
        this.contextSource = null;
        this.invalidate();
      }
    };
  }

  /**
   * Bumps `contextVersion` so open surfaces re-evaluate `enabled` / `checked`. Cheap by
   * design: nothing is evaluated here, only subscribers are told to look again.
   */
  invalidate(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  get contextVersion(): number {
    return this.version;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Lazily evaluated: `enabled` runs now, against the live context. */
  isEnabled(id: CommandId, ctx: CommandContext = this.getContext()): boolean {
    const entry = this.get(id);
    if (!entry) return false;
    return entry.enabled ? entry.enabled(ctx) : true;
  }

  /**
   * The single entry point for behaviour. A disabled command does not run and reports
   * `'disabled'` rather than throwing, matching a disabled ribbon button that cannot be
   * clicked; an unknown id throws because that is always a caller bug.
   *
   * For a family, `args` is the variant's argument. Families do not validate it against
   * `variants`: time signatures, for one, accept any numerator and denominator.
   */
  async run(id: CommandId, args?: unknown): Promise<RunStatus> {
    const entry = this.get(id);
    if (!entry) throw new UnknownCommandError(id);
    const ctx = this.getContext();
    if (entry.enabled && !entry.enabled(ctx)) return 'disabled';
    await (entry.run as (ctx: CommandContext, args: unknown) => void | Promise<void>)(ctx, args);
    return 'ran';
  }

  /** JSON-safe snapshot of everything registered, evaluated against the live context. */
  list(): CommandDescriptor[] {
    const ctx = this.getContext();
    return [...this.registrations.values()].map(({ entry, scope }) => describe(entry, scope, ctx));
  }
}

function describe(entry: AnyCommand, scope: CommandScope, ctx: CommandContext): CommandDescriptor {
  const enabled = entry.enabled ? entry.enabled(ctx) : true;
  if (isCommandFamily(entry)) {
    const family = entry as unknown as CommandFamily<unknown>;
    return {
      id: family.id,
      kind: 'family',
      scope,
      label: family.label,
      enabled,
      variants: family.variants.map((variant) => ({
        arg: variant.arg,
        label: variant.label,
        ...(variant.testId ? { testId: variant.testId } : {}),
      })),
    };
  }
  const command = entry as unknown as Command<unknown>;
  return {
    id: command.id,
    kind: 'command',
    scope,
    label: command.label,
    ...(command.shortcut ? { shortcut: command.shortcut } : {}),
    ...(command.testId ? { testId: command.testId } : {}),
    enabled,
    ...(command.checked ? { checked: command.checked(ctx) } : {}),
  };
}

/** The editor-wide registry. Hooks take another one for tests. */
export const defaultCommandRegistry = new CommandRegistry();

/** Convenience wrapper over the default registry; see `CommandRegistry.run`. */
export const runCommand = (id: CommandId, args?: unknown): Promise<RunStatus> =>
  defaultCommandRegistry.run(id, args);
