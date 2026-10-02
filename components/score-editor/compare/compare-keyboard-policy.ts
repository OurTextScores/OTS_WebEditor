import {
  BINDINGS,
  comboMatches,
  eventToCombo,
  parseKeys,
  type KeyContext,
} from '../../../lib/commands/bindings';
import type { CompareScoreRole } from './compare-types';

export type CompareKeyboardMutationMethod =
  | 'addPitchByStep'
  | 'addSlur'
  | 'addTie'
  | 'deleteSelection'
  | 'enterRest'
  | 'extendSelectionNextChord'
  | 'extendSelectionNextMeasure'
  | 'extendSelectionPrevChord'
  | 'extendSelectionPrevMeasure'
  | 'extendSelectionStaffAbove'
  | 'extendSelectionStaffBelow'
  | 'pitchDown'
  | 'pitchUp'
  | 'redo'
  | 'selectAll'
  | 'selectNextChord'
  | 'selectPrevChord'
  | 'setAccidental'
  | 'setDurationType'
  | 'toggleDot'
  | 'transpose'
  | 'undo';

export type CompareInputStateMethod =
  'setInputAccidentalType' | 'setInputDurationType' | 'toggleInputDot';

export type CompareKeyboardShortcutContext = {
  active: boolean;
  activeRole: CompareScoreRole | null;
  hasSelection: boolean;
  noteMode: boolean;
  mutate: (
    label: string,
    methodName: CompareKeyboardMutationMethod,
    args?: unknown[],
    skipRelayout?: boolean,
  ) => void;
  updateInputState: (methodName: CompareInputStateMethod, args?: unknown[]) => void;
  copySelection: () => void;
  pasteSelection: () => void;
  disableNoteInput: () => void;
  toggleNoteInput: () => void;
  setHasSelection: (role: CompareScoreRole, selected: boolean) => void;
};

/**
 * A compare pane edits a score that is not *the* score, so the main editor's commands cannot
 * run on it. The keys are not a second table, though: the key -> command mapping is the
 * binding table's (`lib/commands/bindings.ts`), the same one the keyboard router reads for the
 * main score. What this file owns is the other half, command -> "which engine method on the
 * pane's score", for the commands a pane supports.
 *
 * A key whose command has no adapter here is not handled in a pane (articulations, flips,
 * and the rest of the main editor's keys), exactly as before.
 */
type Gate = 'always' | 'target' | 'selection';

interface Adapter {
  readonly gate: Gate;
  readonly run: (context: CompareKeyboardShortcutContext, arg: unknown) => void;
}

const mutate =
  (label: string, method: CompareKeyboardMutationMethod, args: unknown[] = [], skip = false) =>
  (context: CompareKeyboardShortcutContext) =>
    context.mutate(label, method, args, skip);

const move = (method: CompareKeyboardMutationMethod): Adapter => ({
  gate: 'selection',
  run: mutate('move compare selection', method, [], true),
});

const ADAPTERS: Readonly<Record<string, Adapter>> = {
  'edit.undo': { gate: 'always', run: mutate('undo', 'undo') },
  'edit.redo': { gate: 'always', run: mutate('redo', 'redo') },
  'edit.selectAll': {
    gate: 'always',
    run: (context) => {
      context.mutate('select all', 'selectAll', [], true);
      if (context.activeRole) context.setHasSelection(context.activeRole, true);
    },
  },
  'edit.copy': { gate: 'always', run: (context) => context.copySelection() },
  'edit.paste': { gate: 'always', run: (context) => context.pasteSelection() },
  'add.noteInput': { gate: 'always', run: (context) => context.toggleNoteInput() },
  'add.note.step': {
    gate: 'target',
    run: (context, arg) => {
      const { step, chord } = arg as { step: number; chord: boolean };
      context.mutate('add a pitch', 'addPitchByStep', [step, chord, false]);
    },
  },
  'add.rest': { gate: 'target', run: mutate('enter a rest', 'enterRest') },
  // In note input these set the state for the next note; otherwise they change the selection.
  'edit.duration.set': {
    gate: 'target',
    run: (context, arg) =>
      context.noteMode
        ? context.updateInputState('setInputDurationType', [arg])
        : context.mutate('set duration', 'setDurationType', [arg]),
  },
  'edit.duration.dot': {
    gate: 'target',
    run: (context) =>
      context.noteMode
        ? context.updateInputState('toggleInputDot')
        : context.mutate('toggle dot', 'toggleDot'),
  },
  'add.accidental': {
    gate: 'target',
    run: (context, arg) =>
      context.noteMode
        ? context.updateInputState('setInputAccidentalType', [arg])
        : context.mutate('set accidental', 'setAccidental', [arg]),
  },
  'add.line.tie': { gate: 'selection', run: mutate('add a tie', 'addTie') },
  'add.line.slur': { gate: 'selection', run: mutate('add a slur', 'addSlur') },
  'edit.pitch.up': { gate: 'selection', run: mutate('raise pitch', 'pitchUp') },
  'edit.pitch.down': { gate: 'selection', run: mutate('lower pitch', 'pitchDown') },
  'edit.pitch.octaveUp': {
    gate: 'selection',
    run: mutate('transpose an octave', 'transpose', [12]),
  },
  'edit.pitch.octaveDown': {
    gate: 'selection',
    run: mutate('transpose an octave', 'transpose', [-12]),
  },
  'edit.select.nextChord': move('selectNextChord'),
  'edit.select.prevChord': move('selectPrevChord'),
  'edit.select.extendNextChord': move('extendSelectionNextChord'),
  'edit.select.extendPrevChord': move('extendSelectionPrevChord'),
  'edit.select.extendNextMeasure': move('extendSelectionNextMeasure'),
  'edit.select.extendPrevMeasure': move('extendSelectionPrevMeasure'),
  'edit.select.extendStaffAbove': {
    gate: 'selection',
    run: mutate('extend selection up', 'extendSelectionStaffAbove', [], true),
  },
  'edit.select.extendStaffBelow': {
    gate: 'selection',
    run: mutate('extend selection down', 'extendSelectionStaffBelow', [], true),
  },
  'edit.delete': {
    gate: 'selection',
    run: (context) => {
      context.mutate('delete selection', 'deleteSelection');
      if (context.activeRole) context.setHasSelection(context.activeRole, false);
    },
  },
};

export function routeCompareKeyboardShortcut(
  event: KeyboardEvent,
  context: CompareKeyboardShortcutContext,
) {
  if (!context.active || !context.activeRole) {
    return false;
  }
  // Escape leaves a pane's note input; anything else it would cancel belongs to the main editor.
  if (event.key === 'Escape' && context.noteMode) {
    event.preventDefault();
    context.disableNoteInput();
    return true;
  }

  const pressed = eventToCombo(event);
  const active: KeyContext[] = [context.noteMode ? 'noteInput' : 'normal', 'edit'];
  for (const binding of BINDINGS) {
    if (!active.includes(binding.context) || !comboMatches(parseKeys(binding.keys), pressed)) {
      continue;
    }
    // Keys the main editor keeps from the page in note input (the up/down arrows).
    if (binding.swallow) {
      event.preventDefault();
      return true;
    }
    const adapter = binding.commandId ? ADAPTERS[binding.commandId] : undefined;
    if (!adapter) continue;
    const allowed =
      adapter.gate === 'always' ||
      (adapter.gate === 'target' && (context.noteMode || context.hasSelection)) ||
      (adapter.gate === 'selection' && context.hasSelection);
    if (!allowed) continue;
    event.preventDefault();
    adapter.run(context, binding.arg);
    return true;
  }
  return false;
}
