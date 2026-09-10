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

const durationTypeByKey: Record<string, number> = {
  '1': 8,
  '2': 7,
  '3': 6,
  '4': 5,
  '5': 4,
  '6': 3,
  '7': 2,
  '8': 1,
};

const noteStepByKey: Record<string, number> = {
  c: 0,
  d: 1,
  e: 2,
  f: 3,
  g: 4,
  a: 5,
  b: 6,
};

export function routeCompareKeyboardShortcut(
  event: KeyboardEvent,
  context: CompareKeyboardShortcutContext,
) {
  if (!context.active || !context.activeRole) {
    return false;
  }
  const rawKey = event.key;
  const key = rawKey.toLowerCase();
  const isMod = event.ctrlKey || event.metaKey;

  if (isMod) {
    if (key === 'z') {
      event.preventDefault();
      context.mutate(event.shiftKey ? 'redo' : 'undo', event.shiftKey ? 'redo' : 'undo');
      return true;
    }
    if (key === 'y') {
      event.preventDefault();
      context.mutate('redo', 'redo');
      return true;
    }
    if (key === 'a') {
      event.preventDefault();
      context.mutate('select all', 'selectAll', [], true);
      context.setHasSelection(context.activeRole, true);
      return true;
    }
    if (key === 'c') {
      event.preventDefault();
      context.copySelection();
      return true;
    }
    if (key === 'v') {
      event.preventDefault();
      context.pasteSelection();
      return true;
    }
  }

  if (key === 'escape' && context.noteMode) {
    event.preventDefault();
    context.disableNoteInput();
    return true;
  }
  if (!isMod && key === 'n' && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    context.toggleNoteInput();
    return true;
  }
  if (context.noteMode && rawKey in durationTypeByKey) {
    event.preventDefault();
    context.updateInputState('setInputDurationType', [durationTypeByKey[rawKey]]);
    return true;
  }
  if (context.noteMode && rawKey === '.') {
    event.preventDefault();
    context.updateInputState('toggleInputDot');
    return true;
  }
  if (context.noteMode && (rawKey === '+' || rawKey === '-' || rawKey === '=')) {
    event.preventDefault();
    context.updateInputState('setInputAccidentalType', [
      rawKey === '+' ? 3 : rawKey === '-' ? 1 : 2,
    ]);
    return true;
  }
  if (context.noteMode && rawKey === '0') {
    event.preventDefault();
    context.mutate('enter a rest', 'enterRest');
    return true;
  }
  if (context.noteMode && !isMod && !event.altKey && key in noteStepByKey) {
    event.preventDefault();
    context.mutate('add a pitch', 'addPitchByStep', [noteStepByKey[key], event.shiftKey, false]);
    return true;
  }
  if (!context.hasSelection) {
    return false;
  }
  if (rawKey in durationTypeByKey) {
    event.preventDefault();
    context.mutate('set duration', 'setDurationType', [durationTypeByKey[rawKey]]);
    return true;
  }
  if (rawKey === '0') {
    event.preventDefault();
    context.mutate('enter a rest', 'enterRest');
    return true;
  }
  if (rawKey === '.') {
    event.preventDefault();
    context.mutate('toggle dot', 'toggleDot');
    return true;
  }
  if (rawKey === '+' || rawKey === '-' || rawKey === '=') {
    event.preventDefault();
    context.mutate('set accidental', 'setAccidental', [
      rawKey === '+' ? 3 : rawKey === '-' ? 1 : 2,
    ]);
    return true;
  }
  if (rawKey === 'T') {
    event.preventDefault();
    context.mutate('add a tie', 'addTie');
    return true;
  }
  if (!event.altKey && key === 's' && !event.shiftKey && !context.noteMode) {
    event.preventDefault();
    context.mutate('add a slur', 'addSlur');
    return true;
  }
  if (!isMod && !event.altKey && key in noteStepByKey) {
    event.preventDefault();
    context.mutate('add a pitch', 'addPitchByStep', [noteStepByKey[key], event.shiftKey, false]);
    return true;
  }
  if (key === 'arrowup' || key === 'arrowdown') {
    event.preventDefault();
    if (event.shiftKey) {
      context.mutate(
        `extend selection ${key === 'arrowup' ? 'up' : 'down'}`,
        key === 'arrowup' ? 'extendSelectionStaffAbove' : 'extendSelectionStaffBelow',
        [],
        true,
      );
    } else if (isMod) {
      context.mutate('transpose an octave', 'transpose', [key === 'arrowup' ? 12 : -12]);
    } else {
      context.mutate(
        key === 'arrowup' ? 'raise pitch' : 'lower pitch',
        key === 'arrowup' ? 'pitchUp' : 'pitchDown',
      );
    }
    return true;
  }
  if (key === 'arrowleft' || key === 'arrowright') {
    event.preventDefault();
    const forward = key === 'arrowright';
    const methodName = event.shiftKey
      ? isMod
        ? forward
          ? 'extendSelectionNextMeasure'
          : 'extendSelectionPrevMeasure'
        : forward
          ? 'extendSelectionNextChord'
          : 'extendSelectionPrevChord'
      : forward
        ? 'selectNextChord'
        : 'selectPrevChord';
    context.mutate('move compare selection', methodName, [], true);
    return true;
  }
  if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    context.mutate('delete selection', 'deleteSelection');
    context.setHasSelection(context.activeRole, false);
    return true;
  }
  return false;
}
