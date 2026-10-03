import { describe, expect, it } from 'vitest';
import {
  always,
  mutable,
  needsBarTarget,
  needsRange,
  needsSelection,
  inNoteInput,
  needsSelectionOutsideInput,
  needsSingle,
  needsSingleOrInput,
  needsTarget,
  READ_ONLY_REASON,
  withCheck,
} from '../../lib/commands/selectionGates';
import { deriveRibbonCommandContext } from '../../components/score-editor/editorCommands';
import { DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import type { EditorCommandProps } from '../../components/score-editor/editorProps';
import type { CommandContext } from '../../lib/commands/types';

const ctx = (over: Partial<CommandContext>): CommandContext => ({
  ...DEFAULT_COMMAND_CONTEXT,
  hasScore: true,
  isMutable: true,
  ...over,
});

const KINDS = ['none', 'single', 'list', 'range'] as const;

/** One row per gate, one column per selection kind (docs/private/SELECTION_BEHAVIOR_MATRIX.md). */
describe('selection gates', () => {
  const table: [string, (c: CommandContext) => boolean, boolean[]][] = [
    ['needsSelection', needsSelection, [false, true, true, true]],
    ['needsRange', needsRange, [false, false, false, true]],
    // A list is refused upstream; a single element means "its bar".
    ['needsBarTarget', needsBarTarget, [false, true, false, true]],
    ['needsSelectionOutsideInput', needsSelectionOutsideInput, [false, true, true, true]],
    ['needsTarget', needsTarget, [false, true, true, true]],
    // The bridge applies these to one element only; desktop applies them to every chord and rest.
    ['needsSingle', needsSingle, [false, true, false, false]],
    ['needsSingleOrInput', needsSingleOrInput, [false, true, false, false]],
  ];

  it.each(table)('%s by kind', (_name, gate, expected) => {
    expect(KINDS.map((kind) => gate(ctx({ selection: kind })))).toEqual(expected);
  });

  it('all edit gates are off in a read-only surface', () => {
    for (const [, gate] of table) {
      for (const kind of KINDS) {
        expect(gate(ctx({ selection: kind, isMutable: false }))).toBe(false);
      }
    }
    expect(mutable(ctx({ isMutable: false }))).toBe(false);
    expect(always(ctx({ isMutable: false }))).toBe(true);
  });

  it('note input stands in for a selection, and takes the keyboard from selection-only gates', () => {
    expect(needsTarget(ctx({ selection: 'none', noteInput: true }))).toBe(true);
    expect(needsSelectionOutsideInput(ctx({ selection: 'single', noteInput: true }))).toBe(false);
    expect(needsSelection(ctx({ selection: 'none', noteInput: true }))).toBe(false);
  });
});

describe('gate reasons (`unmet`)', () => {
  const reasons = (gate: { unmet: (c: CommandContext) => string | undefined }) =>
    KINDS.map((kind) => gate.unmet(ctx({ selection: kind })));

  it('says nothing when the gate is met', () => {
    expect(needsSelection.unmet(ctx({ selection: 'single' }))).toBeUndefined();
    expect(always.unmet(ctx({ isMutable: false }))).toBeUndefined();
  });

  it('tells the user what to select, in words that match the gate', () => {
    expect(reasons(needsSelection)).toEqual([
      'Select something first',
      undefined,
      undefined,
      undefined,
    ]);
    expect(reasons(needsRange)).toEqual(
      Array(3).fill('Select a range of bars or notes').concat(undefined),
    );
    expect(reasons(needsBarTarget)).toEqual([
      'Select a bar or a range of bars',
      undefined,
      'Select one bar, or a range of bars',
      undefined,
    ]);
    expect(reasons(needsSingle)).toEqual([
      'Select a note or rest first',
      undefined,
      'Select a single note or rest',
      'Select a single note or rest',
    ]);
  });

  it('puts "read-only" first in a read-only surface, whatever else is missing', () => {
    for (const gate of [
      mutable,
      needsSelection,
      needsRange,
      needsBarTarget,
      needsSingle,
      needsTarget,
    ]) {
      expect(gate.unmet(ctx({ isMutable: false, selection: 'single' }))).toBe(READ_ONLY_REASON);
    }
  });

  it('explains note input in both directions', () => {
    expect(needsSelectionOutsideInput.unmet(ctx({ selection: 'single', noteInput: true }))).toBe(
      'Not available during note input',
    );
    expect(inNoteInput.unmet(ctx({ noteInput: false }))).toBe('Start note input first');
    expect(needsTarget.unmet(ctx({ selection: 'none' }))).toBe(
      'Select something, or start note input',
    );
  });

  it('withCheck keeps the gate\u2019s reason, then names the missing capability', () => {
    let present = true;
    const check = withCheck(needsSelection, () => present, 'No handler');
    expect(check(ctx({ selection: 'single' }))).toBe(true);
    expect(check.unmet?.(ctx({ selection: 'single' }))).toBeUndefined();
    expect(check.unmet?.(ctx({ selection: 'none' }))).toBe('Select something first');
    present = false;
    expect(check(ctx({ selection: 'single' }))).toBe(false);
    expect(check.unmet?.(ctx({ selection: 'single' }))).toBe('No handler');
  });
});

describe('deriveRibbonCommandContext selection', () => {
  const derive = (over: Partial<EditorCommandProps>) =>
    deriveRibbonCommandContext({ mutationsEnabled: true, ...over } as EditorCommandProps).selection;

  it('is none without a selection, whatever kind was last reported', () => {
    expect(derive({ selectionActive: false, selectionKind: 'range' })).toBe('none');
  });

  it('carries the reported kind, and falls back to single', () => {
    expect(derive({ selectionActive: true, selectionKind: 'range' })).toBe('range');
    expect(derive({ selectionActive: true, selectionKind: 'list' })).toBe('list');
    expect(derive({ selectionActive: true })).toBe('single');
  });
});
