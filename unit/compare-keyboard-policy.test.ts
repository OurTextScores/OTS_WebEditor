import { describe, expect, it, vi } from 'vitest';
import {
  routeCompareKeyboardShortcut,
  type CompareKeyboardShortcutContext,
} from '../components/score-editor/compare/compare-keyboard-policy';

const context = (
  over: Partial<CompareKeyboardShortcutContext> = {},
): CompareKeyboardShortcutContext => ({
  active: true,
  activeRole: 'proposal',
  hasSelection: true,
  noteMode: false,
  mutate: vi.fn(),
  updateInputState: vi.fn(),
  copySelection: vi.fn(),
  pasteSelection: vi.fn(),
  disableNoteInput: vi.fn(),
  toggleNoteInput: vi.fn(),
  setHasSelection: vi.fn(),
  ...over,
});

const press = (
  key: string,
  init: KeyboardEventInit = {},
  ctx: CompareKeyboardShortcutContext = context(),
) => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  return { handled: routeCompareKeyboardShortcut(event, ctx), event, ctx };
};

/**
 * The compare panes read the same key table as the main editor (`lib/commands/bindings.ts`);
 * these pin which engine call each key becomes on a pane's score.
 */
describe('compare keyboard policy, from the shared key table', () => {
  const withSelection: [string, KeyboardEventInit, string, string, unknown[]?][] = [
    ['z', { ctrlKey: true }, 'undo', 'undo'],
    ['z', { ctrlKey: true, shiftKey: true }, 'redo', 'redo'],
    ['y', { ctrlKey: true }, 'redo', 'redo'],
    ['ArrowUp', {}, 'raise pitch', 'pitchUp'],
    ['ArrowDown', {}, 'lower pitch', 'pitchDown'],
    ['ArrowUp', { ctrlKey: true }, 'transpose an octave', 'transpose', [12]],
    ['ArrowDown', { ctrlKey: true }, 'transpose an octave', 'transpose', [-12]],
    ['ArrowRight', {}, 'move compare selection', 'selectNextChord'],
    ['ArrowLeft', { shiftKey: true }, 'move compare selection', 'extendSelectionPrevChord'],
    [
      'ArrowRight',
      { ctrlKey: true, shiftKey: true },
      'move compare selection',
      'extendSelectionNextMeasure',
    ],
    ['ArrowUp', { shiftKey: true }, 'extend selection up', 'extendSelectionStaffAbove'],
    ['5', {}, 'set duration', 'setDurationType', [4]],
    ['.', {}, 'toggle dot', 'toggleDot'],
    ['+', { shiftKey: true }, 'set accidental', 'setAccidental', [3]],
    ['-', {}, 'set accidental', 'setAccidental', [1]],
    ['=', {}, 'set accidental', 'setAccidental', [2]],
    ['0', {}, 'enter a rest', 'enterRest'],
    ['c', {}, 'add a pitch', 'addPitchByStep', [0, false, false]],
    ['E', { shiftKey: true }, 'add a pitch', 'addPitchByStep', [2, true, false]],
    ['s', {}, 'add a slur', 'addSlur'],
    // The tie key: plain T, as on desktop (the old table tested the capital letter).
    ['t', {}, 'add a tie', 'addTie'],
    ['Delete', {}, 'delete selection', 'deleteSelection'],
    ['Backspace', {}, 'delete selection', 'deleteSelection'],
  ];

  it.each(withSelection)('%s %j -> %s', (key, init, label, method, args) => {
    const { handled, event, ctx } = press(key, init);
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    // Whether the pane relayouts is the fourth argument; what the key *does* is the first three.
    const [call] = vi.mocked(ctx.mutate).mock.calls;
    expect(call.slice(0, 2)).toEqual([label, method]);
    if (args) expect(call[2]).toEqual(args);
  });

  it('selects all and records that the pane now has a selection', () => {
    const { ctx } = press('a', { ctrlKey: true }, context({ hasSelection: false }));
    expect(ctx.mutate).toHaveBeenCalledWith('select all', 'selectAll', [], true);
    expect(ctx.setHasSelection).toHaveBeenCalledWith('proposal', true);
  });

  it('routes the clipboard and note-input toggle to the pane', () => {
    expect(press('c', { ctrlKey: true }).ctx.copySelection).toHaveBeenCalledOnce();
    expect(press('v', { ctrlKey: true }).ctx.pasteSelection).toHaveBeenCalledOnce();
    expect(press('n', {}, context({ hasSelection: false })).ctx.toggleNoteInput).toHaveBeenCalled();
  });

  it('needs a selection for selection commands, but not for undo or note input', () => {
    const none = context({ hasSelection: false });
    expect(press('ArrowUp', {}, none).handled).toBe(false);
    expect(press('Delete', {}, none).handled).toBe(false);
    expect(press('5', {}, none).handled).toBe(false);
    expect(press('z', { ctrlKey: true }, none).handled).toBe(true);
  });

  it('uses note input as the target in note input, with no selection', () => {
    const input = context({ noteMode: true, hasSelection: false });
    expect(vi.mocked(press('g', {}, input).ctx.mutate).mock.calls[0].slice(0, 3)).toEqual([
      'add a pitch',
      'addPitchByStep',
      [4, false, false],
    ]);
    const durations = press('3', {}, context({ noteMode: true, hasSelection: false }));
    expect(durations.ctx.updateInputState).toHaveBeenCalledWith('setInputDurationType', [6]);
    expect(durations.ctx.mutate).not.toHaveBeenCalled();
    const dots = press('.', {}, context({ noteMode: true, hasSelection: false }));
    expect(dots.ctx.updateInputState).toHaveBeenCalledWith('toggleInputDot');
    const accidentals = press('-', {}, context({ noteMode: true, hasSelection: false }));
    expect(accidentals.ctx.updateInputState).toHaveBeenCalledWith('setInputAccidentalType', [1]);
  });

  it('leaves slur to selection mode, as in the main editor', () => {
    expect(press('s', {}, context({ noteMode: true })).handled).toBe(false);
  });

  it('keeps the up and down arrows from the page in note input, without editing', () => {
    const input = context({ noteMode: true });
    const { handled, event } = press('ArrowUp', {}, input);
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(input.mutate).not.toHaveBeenCalled();
  });

  it('leaves Escape in note input to the pane, and otherwise to the main editor', () => {
    const input = context({ noteMode: true });
    expect(press('Escape', {}, input).handled).toBe(true);
    expect(input.disableNoteInput).toHaveBeenCalledOnce();
    expect(press('Escape').handled).toBe(false);
  });

  it('ignores keys that only the main editor supports', () => {
    expect(press('x').handled).toBe(false);
    expect(press('S', { shiftKey: true }).handled).toBe(false);
    expect(press('b', { ctrlKey: true }).handled).toBe(false);
  });

  it('does nothing without an active pane', () => {
    expect(press('z', { ctrlKey: true }, context({ active: false })).handled).toBe(false);
    expect(press('z', { ctrlKey: true }, context({ activeRole: null })).handled).toBe(false);
  });
});
