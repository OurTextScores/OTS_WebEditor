import { describe, expect, it } from 'vitest';
import {
  describeEngineEntry,
  describeMutation,
  EMPTY_HISTORY,
  humanize,
  isCursorMove,
  rebuild,
  reconcile,
  type HistoryState,
  undoAvailability,
} from '../../components/score-editor/undoHistory';

let counter = 0;
const nextId = () => (counter += 1);
const info = (index: number, size: number, clean = false) => ({ index, size, clean });
const after = (state: HistoryState, i: number, size: number, label?: string) =>
  reconcile(state, info(i, size), label, nextId);

describe('describing an edit', () => {
  it('uses the table where the camel case is not enough, and splits it where it is', () => {
    expect(describeMutation('pitchUp')).toBe('Raise pitch');
    expect(describeMutation('deleteSelection')).toBe('Delete');
    expect(describeMutation('addDynamic')).toBe('Add dynamic');
    expect(describeMutation('add staff text')).toBe('Add staff text');
    expect(humanize('setDurationType')).toBe('Set duration type');
    expect(describeMutation('add tuplet 3')).toBe('Add tuplet 3');
    expect(describeMutation('drop Accent')).toBe('Drop accent');
    expect(humanize('')).toBe('Edit');
  });

  it('says what a coded argument means, with the toolbar’s own option names', () => {
    expect(describeMutation('add articulation articAccentAbove')).toBe('Add accent');
    expect(describeMutation('add articulation stringsUpBow')).toBe('Add up bow');
    expect(describeMutation('add articulation nonsense')).toBe('Add articulation');
    expect(describeMutation('set accidental 3')).toMatch(/^Accidental: /);
    expect(describeMutation('set accidental 999')).toBe('Set accidental');
    expect(describeMutation('set barline type 2')).toMatch(/^Barline: /);
    expect(describeMutation('add grace note 0')).toMatch(/^Add /);
    expect(describeMutation('set repeat count 3')).toBe('Repeat 3x');
  });

  it('turns the engine’s command names into a sentence, without the pointer', () => {
    expect(
      describeEngineEntry({
        commands: ['Add:    <Slur> 0x120c2d0'],
        elements: ['Slur'],
        tickStart: 0,
        tickEnd: 0,
      }),
    ).toBe('Add slur');
    expect(
      describeEngineEntry({
        commands: ['Remove: Accidental 0x120b7b0', 'ChangePitch'],
        elements: [],
        tickStart: 0,
        tickEnd: 0,
      }),
    ).toBe('Remove accidental');
    expect(
      describeEngineEntry({
        commands: ['Add:    <Segment-ChordRest> 0xd2eaa0'],
        elements: [],
        tickStart: 0,
        tickEnd: 0,
      }),
    ).toBe('Add segment');
    expect(
      describeEngineEntry({
        commands: ['ChangePitch', 'ChangeProperty'],
        elements: ['Note'],
        tickStart: 0,
        tickEnd: 0,
      }),
    ).toBe('Change pitch');
    expect(
      describeEngineEntry({ commands: [], elements: ['Note'], tickStart: -1, tickEnd: -1 }),
    ).toBe('Edit note');
    expect(describeEngineEntry({ commands: [], elements: [], tickStart: -1, tickEnd: -1 })).toBe(
      'Edit',
    );
  });

  it('tells edits from cursor moves', () => {
    expect(isCursorMove('undo')).toBe(true);
    expect(isCursorMove('undo to')).toBe(true);
    expect(isCursorMove('addDynamic')).toBe(false);
    expect(isCursorMove(undefined)).toBe(false);
  });
});

describe('reconciling with the engine', () => {
  it('appends a described entry for an edit', () => {
    const { state, needsRebuild } = after(EMPTY_HISTORY, 1, 1, 'addDynamic');
    expect(needsRebuild).toBe(false);
    expect(state.entries.map((e) => e.description)).toEqual(['Add dynamic']);
    expect(state).toMatchObject({ index: 1, known: true, clean: false });
  });

  it('keeps the entries and moves only the cursor on undo, redo and a jump', () => {
    let state = after(EMPTY_HISTORY, 1, 1, 'pitchUp').state;
    state = after(state, 2, 2, 'addDynamic').state;
    const ids = state.entries.map((e) => e.id);
    const undone = after(state, 1, 2, 'undo');
    expect(undone.needsRebuild).toBe(false);
    expect(undone.state.entries.map((e) => e.id)).toEqual(ids);
    expect(undone.state.index).toBe(1);
    const jumped = after(undone.state, 0, 2, 'undo to');
    expect(jumped.state.index).toBe(0);
    expect(jumped.state.entries).toHaveLength(2);
  });

  it('drops the redo tail when a new edit follows an undo, even when the size does not change', () => {
    let state = after(EMPTY_HISTORY, 1, 1, 'pitchUp').state;
    state = after(state, 2, 2, 'addDynamic').state;
    state = after(state, 1, 2, 'undo').state;
    const next = after(state, 2, 2, 'addSlur');
    expect(next.needsRebuild).toBe(false);
    expect(next.state.entries.map((e) => e.description)).toEqual(['Raise pitch', 'Add slur']);
  });

  it('drops a longer tail', () => {
    let state: HistoryState = EMPTY_HISTORY;
    for (const [i, label] of ['pitchUp', 'addDynamic', 'addSlur', 'addTie'].entries()) {
      state = after(state, i + 1, i + 1, label).state;
    }
    state = after(state, 1, 4, 'undo to').state;
    const next = after(state, 2, 2, 'addFermata');
    expect(next.state.entries.map((e) => e.description)).toEqual(['Raise pitch', 'Add fermata']);
    expect(next.needsRebuild).toBe(false);
  });

  it('leaves everything as it was for an edit that changed nothing', () => {
    const state = after(EMPTY_HISTORY, 1, 1, 'pitchUp').state;
    const same = after(state, 1, 1, 'addDynamic');
    expect(same.state.entries).toEqual(state.entries);
    expect(same.needsRebuild).toBe(false);
  });

  it('asks for a rebuild when the engine’s size disagrees (a reloaded score, an edit outside the editor)', () => {
    const state = after(EMPTY_HISTORY, 1, 1, 'pitchUp').state;
    expect(after(state, 3, 3, undefined).needsRebuild).toBe(true);
    expect(after(EMPTY_HISTORY, 0, 4, undefined).needsRebuild).toBe(true);
  });

  it('describes a multi-step jump forward as several entries, the last one by its label', () => {
    const { state } = after(EMPTY_HISTORY, 3, 3, 'addDynamic');
    expect(state.entries.map((e) => e.description)).toEqual(['Edit', 'Edit', 'Add dynamic']);
  });

  it('describes every entry from the engine’s words on a rebuild, in order', () => {
    const rebuilt = rebuild(
      [
        { commands: ['ChangePitch'], elements: ['Note'], tickStart: 0, tickEnd: 0 },
        { commands: ['Add:    Dynamic <> 0x1'], elements: ['Dynamic'], tickStart: 0, tickEnd: 0 },
      ],
      info(1, 2),
      nextId,
    );
    expect(rebuilt.entries.map((e) => e.description)).toEqual(['Change pitch', 'Add dynamic']);
    expect(rebuilt).toMatchObject({ index: 1, known: true });
  });
});

describe('what the command layer is told', () => {
  const state = (index: number, size: number): HistoryState => ({
    entries: Array.from({ length: size }, (_, i) => ({ id: i, description: 'Edit' })),
    index,
    clean: index === 0,
    known: true,
  });

  it('says nothing until the engine has answered, so the old behaviour stands', () => {
    expect(undoAvailability(EMPTY_HISTORY, false)).toEqual({});
  });

  it('says whether there is anything to undo or redo', () => {
    expect(undoAvailability(state(0, 0), false)).toEqual({ canUndo: false, canRedo: false });
    expect(undoAvailability(state(2, 2), false)).toEqual({ canUndo: true, canRedo: false });
    expect(undoAvailability(state(1, 3), false)).toEqual({ canUndo: true, canRedo: true });
    expect(undoAvailability(state(0, 3), false)).toEqual({ canUndo: false, canRedo: true });
  });

  it('assumes both are possible while a read is in flight, so a key right after an edit is not lost', () => {
    expect(undoAvailability(state(0, 0), true)).toEqual({ canUndo: true, canRedo: true });
  });
});
