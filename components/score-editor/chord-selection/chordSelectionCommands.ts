import { defineCommand, type AnyCommand } from '../../../lib/commands/types';
import { needsSelection, needsSingle, withCheck } from '../../../lib/commands/selectionGates';
import { moveInChord, repeatSelection, type ChordSelectionInputs } from './chordSelection';

/**
 * The chord-selection commands (roadmap E11), built from the live inputs at run time. The note-above/below commands
 * act on a single note or rest (the engine's `selection().element()`), so on a range they are disabled and
 * Alt+Up/Down falls through to moving measures between systems, as desktop's narrower shortcut context wins there.
 * Hook-free: the command catalog (read by the server-rendered Help page) builds these too.
 */
export function buildChordSelectionCommands(getInputs: () => ChordSelectionInputs): AnyCommand[] {
  const can = (method: 'selectNoteInChord' | 'repeatSelection') => () =>
    Boolean(getInputs().core.scoreRef.current?.[method]);
  const move = (id: string, label: string, up: boolean, top: boolean) =>
    defineCommand({
      id,
      label,
      keywords: [
        'chord',
        'note',
        'selection',
        top ? (up ? 'top' : 'bottom') : up ? 'above' : 'below',
      ],
      enabled: withCheck(needsSingle, can('selectNoteInChord')),
      run: async () => {
        await moveInChord(getInputs(), up, top);
      },
    });
  return [
    move('edit.select.noteAbove', 'Select Note Above', true, false),
    move('edit.select.noteBelow', 'Select Note Below', false, false),
    move('edit.select.chordTop', 'Select Top Note of Chord', true, true),
    move('edit.select.chordBottom', 'Select Bottom Note of Chord', false, true),
    defineCommand({
      id: 'edit.repeatSelection',
      label: 'Repeat Selection',
      keywords: ['repeat', 'duplicate', 'copy'],
      enabled: withCheck(needsSelection, can('repeatSelection')),
      run: () => repeatSelection(getInputs()),
    }),
  ];
}
