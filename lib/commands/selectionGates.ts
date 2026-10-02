import type { CommandContext } from './types';

/**
 * Named `enabled` predicates over the selection (docs/private/SELECTION_BEHAVIOR_MATRIX.md).
 *
 * Each row of the matrix is one of these, so "what is Slur for a list?" has one answer that a
 * unit test can read. Commands use the names; they do not spell out `ctx.selection !== 'none'`.
 */
export type Gate = (ctx: CommandContext) => boolean;

export const always: Gate = () => true;

/** Editing is on (a score is loaded and not in a read-only surface). */
export const mutable: Gate = (ctx) => ctx.isMutable;

/** Something is selected, of any kind. The default for commands that act on "the selection". */
export const needsSelection: Gate = (ctx) => ctx.isMutable && ctx.selection !== 'none';

/** Note input's cursor stands in for a selection (durations, accidentals). */
export const needsTarget: Gate = (ctx) =>
  ctx.isMutable && (ctx.noteInput || ctx.selection !== 'none');

/** A selection, but not while note input owns the keyboard (pitch moves, duration steps). */
export const needsSelectionOutsideInput: Gate = (ctx) =>
  ctx.isMutable && ctx.selection !== 'none' && !ctx.noteInput;

/**
 * A contiguous range: Select All, a bar click, a Shift-extended selection. The bulk tools
 * (explode, implode, regroup, resequence) work on a span and the engine refuses anything else.
 */
export const needsRange: Gate = (ctx) => ctx.isMutable && ctx.selection === 'range';

/**
 * Bar commands. Upstream refuses a disjoint list outright (`cmdTimeDelete` requires a range),
 * so a list is out; a single element means "its bar" and a range means "these bars".
 */
export const needsBarTarget: Gate = (ctx) =>
  ctx.isMutable && (ctx.selection === 'range' || ctx.selection === 'single');
