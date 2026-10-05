import type { CommandContext } from './types';

/**
 * Commands whose menu and palette label depends on the moment: Undo and Redo name what they would undo or redo
 * ("Undo Add dynamic"). Kept as one table here, not on each command, so the command definitions stay static data.
 */
const DYNAMIC_LABELS: Readonly<Record<string, (ctx: CommandContext) => string | undefined>> = {
  'edit.undo': (ctx) => (ctx.undoLabel ? `Undo ${ctx.undoLabel}` : undefined),
  'edit.redo': (ctx) => (ctx.redoLabel ? `Redo ${ctx.redoLabel}` : undefined),
};

/** The label to show for command `id` in `ctx`: its dynamic label when it has one now, else its own. */
export const labelFor = (id: string, label: string, ctx: CommandContext): string =>
  DYNAMIC_LABELS[id]?.(ctx) ?? label;
