import type { CommandContext, Enabled } from './types';

/**
 * Named `enabled` predicates over the selection (docs/private/SELECTION_BEHAVIOR_MATRIX.md).
 *
 * Each row of the matrix is one of these, so "what is Slur for a list?" has one answer that a
 * unit test can read. Commands use the names; they do not spell out `ctx.selection !== 'none'`.
 * Each gate also says why it is not met (`unmet`), which the palette and menus show.
 */
export type Gate = ((ctx: CommandContext) => boolean) & {
  readonly unmet: (ctx: CommandContext) => string | undefined;
};

export const READ_ONLY_REASON = 'This score is read-only here';

function gate(test: (ctx: CommandContext) => boolean, why: (ctx: CommandContext) => string): Gate {
  const fn = (ctx: CommandContext) => test(ctx);
  return Object.assign(fn, {
    unmet: (ctx: CommandContext) =>
      test(ctx) ? undefined : ctx.isMutable ? why(ctx) : READ_ONLY_REASON,
  });
}

export const always: Gate = Object.assign(() => true, { unmet: () => undefined });

/** Editing is on (a score is loaded and not in a read-only surface). */
export const mutable: Gate = gate(
  (ctx) => ctx.isMutable,
  () => READ_ONLY_REASON,
);

/** Something is selected, of any kind. The default for commands that act on "the selection". */
export const needsSelection: Gate = gate(
  (ctx) => ctx.isMutable && ctx.selection !== 'none',
  () => 'Select something first',
);

/** Note input's cursor stands in for a selection (durations, accidentals). */
export const needsTarget: Gate = gate(
  (ctx) => ctx.isMutable && (ctx.noteInput || ctx.selection !== 'none'),
  () => 'Select something, or start note input',
);

/** A selection, but not while note input owns the keyboard (pitch moves, duration steps). */
export const needsSelectionOutsideInput: Gate = gate(
  (ctx) => ctx.isMutable && ctx.selection !== 'none' && !ctx.noteInput,
  (ctx) => (ctx.noteInput ? 'Not available during note input' : 'Select something first'),
);

/** Note input must be on: the commands that only make sense while entering notes. */
export const inNoteInput: Gate = gate(
  (ctx) => ctx.isMutable && ctx.noteInput,
  () => 'Start note input first',
);

/** Undo and Redo need something on the engine's undo stack to move over. */
export const historyGates = {
  undo: gate(
    (ctx) => ctx.isMutable && ctx.canUndo,
    () => 'Nothing to undo',
  ),
  redo: gate(
    (ctx) => ctx.isMutable && ctx.canRedo,
    () => 'Nothing to redo',
  ),
};

/**
 * A contiguous range: Select All, a bar click, a Shift-extended selection. The bulk tools
 * (explode, implode, regroup, resequence) work on a span and the engine refuses anything else.
 */
export const needsRange: Gate = gate(
  (ctx) => ctx.isMutable && ctx.selection === 'range',
  () => 'Select a range of bars or notes',
);

/**
 * Bar commands. Upstream refuses a disjoint list outright (`cmdTimeDelete` requires a range),
 * so a list is out; a single element means "its bar" and a range means "these bars".
 */
export const needsBarTarget: Gate = gate(
  (ctx) => ctx.isMutable && (ctx.selection === 'range' || ctx.selection === 'single'),
  (ctx) =>
    ctx.selection === 'none'
      ? 'Select a bar or a range of bars'
      : 'Select one bar, or a range of bars',
);

const singleReason = (ctx: CommandContext) =>
  ctx.selection === 'none' ? 'Select a note or rest first' : 'Select a single note or rest';

/**
 * Exactly one element. For actions the engine bridge applies to `selection().element()` only: desktop
 * MuseScore applies them to every chord and rest of a list or range, our bridge refuses (see the
 * matrix, "known differences"). The gate states what works today rather than offering a no-op.
 */
export const needsSingle: Gate = gate(
  (ctx) => ctx.isMutable && ctx.selection === 'single',
  singleReason,
);

/** As `needsSingle`, but note input's cursor is also a valid target (it sets the input duration). */
export const needsSingleOrInput: Gate = gate(
  (ctx) => ctx.isMutable && (ctx.noteInput || ctx.selection === 'single'),
  (ctx) => (ctx.noteInput ? 'Not available' : singleReason(ctx)),
);

/**
 * `gate` and a check on something outside the context (a handler is wired, a capability exists).
 * Carries the gate's reason, then `missing` when only the extra check fails.
 */
export function withCheck(
  base: Gate,
  present: () => boolean,
  missing = 'Not available for this score',
): Enabled {
  const fn = (ctx: CommandContext) => base(ctx) && present();
  return Object.assign(fn, {
    unmet: (ctx: CommandContext) => base.unmet(ctx) ?? (present() ? undefined : missing),
  });
}
