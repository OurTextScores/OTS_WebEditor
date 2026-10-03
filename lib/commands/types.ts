import type React from 'react';
import type { OtsModeKind } from '../../components/shell/workspaceMode';

export type CommandId = string; // 'file.export.pdf', 'add.timeSignature', 'view.panel.properties'

/**
 * What a command needs to know to decide whether it is available. Deliberately small and
 * flat: surfaces evaluate `enabled` / `checked` lazily while open, never on every
 * selection change (SHELL_REDESIGN_DESIGN §5.2).
 */
export interface CommandContext {
  readonly mode: OtsModeKind;
  readonly hasScore: boolean;
  readonly selection: 'none' | 'single' | 'list' | 'range';
  readonly noteInput: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly aiEnabled: boolean;
  readonly isMutable: boolean; // false in read-only/review surfaces
}

/**
 * An availability test. It may carry `unmet`: why the command is unavailable right now, in words a
 * user can act on ("Select a bar or a range of bars"). Surfaces show it instead of a bare "unavailable".
 */
export type Enabled = ((ctx: CommandContext) => boolean) & {
  readonly unmet?: (ctx: CommandContext) => string | undefined;
};

/** Why `enabled` is false for this context, if it says. Undefined when the command is available. */
export const unmetReason = (
  enabled: Enabled | undefined,
  ctx: CommandContext,
): string | undefined => (enabled && !enabled(ctx) ? enabled.unmet?.(ctx) : undefined);

export interface Command<Args = void> {
  readonly id: CommandId;
  readonly label: string; // action copy: no trailing '…'
  readonly menuLabel?: string; // optional longer form for menus
  readonly keywords?: readonly string[]; // palette search
  readonly icon?: React.ComponentType<{ size?: number }> | string; // lucide or SMuFL glyph id
  readonly testId?: string; // preserved legacy data-testid (§9)
  readonly opensDialog?: boolean; // menus may show '…' by convention; label itself stays clean
  readonly visible?: (ctx: CommandContext) => boolean;
  readonly enabled?: Enabled;
  readonly checked?: (ctx: CommandContext) => boolean; // toggles (panels, filters, voices)
  readonly run: (ctx: CommandContext, args: Args) => void | Promise<void>;
}

export interface CommandVariant<Arg> {
  readonly arg: Arg;
  readonly label: string;
  readonly icon?: string;
  readonly testId?: string;
}

/** A command family whose variants come from data (clefs, time sigs, dynamics…). */
export interface CommandFamily<Arg> {
  readonly id: CommandId; // 'add.clef'
  readonly label: string; // 'Clef'
  readonly variants: readonly CommandVariant<Arg>[];
  readonly enabled?: Enabled;
  /** Toggle families (selection filter bits): whether one variant is currently on. */
  readonly checked?: (ctx: CommandContext, arg: Arg) => boolean;
  readonly run: (ctx: CommandContext, arg: Arg) => void | Promise<void>;
}

/**
 * Anything registrable, with its argument type erased; build one with `defineCommand` or
 * `defineFamily`, which keep the definition checked against its real argument type.
 */
export type AnyCommand = Command<never> | CommandFamily<never>;

export const isCommandFamily = (entry: AnyCommand): entry is CommandFamily<never> =>
  'variants' in entry;

/** `global` lives with the editor root; `mode` clears when the active mode unmounts. */
export type CommandScope = 'global' | 'mode';

export type RunStatus = 'ran' | 'disabled';

/** JSON-safe view of a registered entry, for `window.__otsCommands.list()` and the palette. */
export interface CommandDescriptor {
  readonly id: CommandId;
  readonly kind: 'command' | 'family';
  readonly scope: CommandScope;
  readonly label: string;
  readonly shortcut?: string;
  readonly testId?: string;
  readonly enabled: boolean;
  /** Why it is unavailable, when it is and the gate says. */
  readonly disabledReason?: string;
  readonly checked?: boolean;
  readonly variants?: readonly { arg: unknown; label: string; testId?: string }[];
}

/**
 * Registration needs one type for commands of every argument type. TypeScript cannot
 * express "a command of any `Args`" without `any` (the argument is contravariant but a
 * family's `variants` are covariant), so a definition is checked against its own argument
 * type here and erased once.
 */
export const defineCommand = <Args = void>(command: Command<Args>): AnyCommand =>
  command as unknown as AnyCommand;

export const defineFamily = <Arg>(family: CommandFamily<Arg>): AnyCommand =>
  family as unknown as AnyCommand;
