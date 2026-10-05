import type { UndoEntryInfo, UndoInfo } from '../../lib/webmscore-loader';
import {
  accidentalOptions,
  articulationOptions,
  barlineOptions,
  graceNoteOptions,
} from '../toolbar/constants';

/**
 * The editor's view of the engine's undo stack (docs/private/UNDO_HISTORY_PANEL_DESIGN_2026-10-04.md): one entry
 * per engine edit, each described in words. The engine is the source of truth for how many entries there are and
 * where the cursor stands; the editor only adds the words, once, when an entry appears.
 */
export interface HistoryEntry {
  /** Stable for the life of the entry (a new edit after an undo gets a new id). */
  readonly id: number;
  readonly description: string;
}

export interface HistoryState {
  /** Oldest first; `entries.length` equals the engine's stack size once reconciled. */
  readonly entries: readonly HistoryEntry[];
  /** Entries applied: 0 is the loaded score. */
  readonly index: number;
  readonly clean: boolean;
  /** False until the engine has answered (and for engines without the exports): the panel and gates stay out of it. */
  readonly known: boolean;
}

export const EMPTY_HISTORY: HistoryState = { entries: [], index: 0, clean: true, known: false };

/** Labels that are not edits: they move the cursor, they do not add an entry. */
const CURSOR_LABELS = new Set(['undo', 'redo', 'undo to']);
export const isCursorMove = (label: string | undefined) =>
  label !== undefined && CURSOR_LABELS.has(label);

/** Words for the labels where "split the camel case" is not enough. */
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  pitchUp: 'Raise pitch',
  pitchDown: 'Lower pitch',
  'raise pitch': 'Raise pitch',
  'lower pitch': 'Lower pitch',
  deleteSelection: 'Delete',
  doubleDuration: 'Double the duration',
  halfDuration: 'Halve the duration',
  toggleDot: 'Dot',
  toggleDoubleDot: 'Double dot',
  toggleLineBreak: 'Line break',
  togglePageBreak: 'Page break',
  toggleRepeatStart: 'Start repeat',
  toggleRepeatEnd: 'End repeat',
  flipStem: 'Flip direction',
  putNote: 'Add note',
  enterRest: 'Add rest',
  addPitchByStep: 'Add note',
  applyDropAtPoint: 'Drop from palette',
  changeSelectedElementsVoice: 'Change voice',
  setSelectedElementProperty: 'Change property',
  setSelectedFretDiagram: 'Change fretboard diagram',
  setSelectedText: 'Edit text',
  'set selected text': 'Edit text',
  pasteSelection: 'Paste',
  'paste selection': 'Paste',
  removeSelectedMeasures: 'Remove bars',
  removeTrailingEmptyMeasures: 'Remove empty trailing bars',
  insertMeasures: 'Insert bars',
  'insert measures': 'Insert bars',
  addPickupMeasure: 'Add pickup bar',
  'add pickup measure': 'Add pickup bar',
  setMultiMeasureRests: 'Multi-bar rests',
  setPartVisible: 'Show or hide instrument',
  appendPart: 'Add instrument',
  removePart: 'Remove instrument',
  selectAll: 'Select all',
  transpose: 'Transpose',
  'relayout score': 'Relayout',
};

/** "addDynamic" -> "Add dynamic"; "add staff text" -> "Add staff text". */
export function humanize(label: string): string {
  const words = label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Edit';
}

/**
 * Some labels carry the argument as a code ("set accidental 3", "add articulation articAccentAbove"): say what the code
 * means, using the same option tables the toolbar does.
 */
const WITH_ARGUMENT: readonly [RegExp, (arg: string) => string | undefined][] = [
  [
    /^add articulation (\w+)$/,
    (arg) => {
      const option = articulationOptions.find((candidate) => candidate.symbol === arg);
      return option ? `Add ${option.label.toLowerCase()}` : 'Add articulation';
    },
  ],
  [
    /^set accidental (\d+)$/,
    (arg) => {
      const option = accidentalOptions.find((candidate) => String(candidate.value) === arg);
      return option ? `Accidental: ${option.name.toLowerCase()}` : 'Set accidental';
    },
  ],
  [
    /^set barline type (\d+)$/,
    (arg) => {
      const option = barlineOptions.find((candidate) => String(candidate.value) === arg);
      return option ? `Barline: ${option.label.toLowerCase()}` : 'Set barline';
    },
  ],
  [
    /^add grace note (\d+)$/,
    (arg) => {
      const option = graceNoteOptions.find((candidate) => String(candidate.value) === arg);
      return option ? `Add ${option.label.toLowerCase()}` : 'Add grace note';
    },
  ],
  [/^set repeat count (\d+)$/, (arg) => `Repeat ${arg}x`],
];

/** The sentence for an edit, from the label `performMutation` was called with. */
export function describeMutation(label: string): string {
  const exact = DESCRIPTIONS[label];
  if (exact) return exact;
  for (const [pattern, say] of WITH_ARGUMENT) {
    const match = pattern.exec(label);
    if (match) return say(match[1]) ?? humanize(label);
  }
  return humanize(label);
}

/** The engine's own names carry debugging text ("Add:    <Slur> 0x120c2d0"); take the verb and the element out of it. */
const ADD_OR_REMOVE = /^(Add|Remove):\s*<?([A-Za-z-]+?)>?(?:\s|$)/;

/** A sentence for an entry the editor did not label (gestures, text edits): from what the engine says it did. */
export function describeEngineEntry(entry: UndoEntryInfo): string {
  for (const command of entry.commands) {
    const match = ADD_OR_REMOVE.exec(command);
    if (match) {
      const element = match[2].replace(/-.*$/, '');
      return `${match[1]} ${element.toLowerCase()}`;
    }
  }
  const named = entry.commands.find((command) => /^[A-Z][A-Za-z]+$/.test(command));
  if (named) return humanize(named);
  return entry.elements.length ? `Edit ${entry.elements[0].toLowerCase()}` : 'Edit';
}

/**
 * Brings the history in line with what the engine reports after an operation.
 *
 * - `label` is the mutation that just ran, or undefined / a cursor label for undo, redo and jumps.
 * - A new edit lands at the old cursor: whatever was beyond it (the redo tail) is gone.
 * - `needsRebuild` is set when the result does not add up to the engine's size; the caller then describes every
 *   entry from the engine's own text instead, so the panel is right after any surprise.
 */
export function reconcile(
  previous: HistoryState,
  info: UndoInfo,
  label: string | undefined,
  nextId: () => number,
): { state: HistoryState; needsRebuild: boolean } {
  let entries = previous.entries;
  if (!isCursorMove(label) && label !== undefined && info.index > previous.index) {
    entries = previous.entries.slice(0, previous.index);
    for (let position = previous.index; position < info.index; position += 1) {
      const last = position === info.index - 1;
      entries = [
        ...entries,
        { id: nextId(), description: last ? describeMutation(label) : 'Edit' },
      ];
    }
  }
  const needsRebuild = entries.length !== info.size;
  return {
    state: { entries, index: info.index, clean: info.clean, known: true },
    needsRebuild,
  };
}

/** Every entry described from the engine's own words. */
export function rebuild(
  entries: readonly UndoEntryInfo[],
  info: UndoInfo,
  nextId: () => number,
): HistoryState {
  return {
    entries: entries.map((entry) => ({ id: nextId(), description: describeEngineEntry(entry) })),
    index: info.index,
    clean: info.clean,
    known: true,
  };
}

/** What the command layer needs from the history: whether Undo and Redo have anything to do (unset until known). */
export function undoAvailability(history: HistoryState, refreshing: boolean) {
  if (!history.known) return {};
  return {
    canUndo: history.index > 0 || refreshing,
    canRedo: history.index < history.entries.length || refreshing,
  };
}
