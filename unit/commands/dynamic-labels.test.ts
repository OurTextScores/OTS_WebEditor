import { describe, expect, it } from 'vitest';
import { labelFor } from '../../lib/commands/dynamicLabels';
import { DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import { undoAvailability } from '../../components/score-editor/undoHistory';

const ctx = (over = {}) => ({ ...DEFAULT_COMMAND_CONTEXT, ...over });

describe('dynamic command labels', () => {
  it('names what Undo and Redo would act on', () => {
    expect(labelFor('edit.undo', 'Undo', ctx({ undoLabel: 'Add dynamic' }))).toBe(
      'Undo Add dynamic',
    );
    expect(labelFor('edit.redo', 'Redo', ctx({ redoLabel: 'Delete' }))).toBe('Redo Delete');
  });

  it('falls back to the plain label when the engine has not said', () => {
    expect(labelFor('edit.undo', 'Undo', ctx())).toBe('Undo');
  });

  it('leaves other commands alone', () => {
    expect(labelFor('file.open', 'Open', ctx({ undoLabel: 'x' }))).toBe('Open');
  });

  it('takes the labels from the entries either side of the cursor', () => {
    const entries = [{ description: 'A' }, { description: 'B' }, { description: 'C' }];
    const state = { known: true, index: 2, entries } as unknown as Parameters<
      typeof undoAvailability
    >[0];
    expect(undoAvailability(state, false)).toMatchObject({ undoLabel: 'B', redoLabel: 'C' });
  });
});
