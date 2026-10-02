import { describe, expect, it } from 'vitest';
import {
  always,
  mutable,
  needsBarTarget,
  needsRange,
  needsSelection,
  needsSelectionOutsideInput,
  needsTarget,
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
