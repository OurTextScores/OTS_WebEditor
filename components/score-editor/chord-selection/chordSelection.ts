import type { EditorCore } from '../core';

/*
 * Moving the selection within a chord, and repeating the selection (roadmap E11): desktop MuseScore's up-chord /
 * down-chord (Alt+Up/Down), top-chord / bottom-chord (Ctrl+Alt+Up/Down) and repeat-sel (R). The engine does the
 * work (bridge chordselection.h); this module projects the editor's selection into it first and shows the result.
 */

/** What the editor shows a moved selection with: its page, the overlay read back from the SVG, and the audition. */
export interface SelectionView {
  readonly goToPage: (page: number) => Promise<unknown>;
  readonly refreshSelectionFromSvg: () => Promise<void>;
  readonly playSelectionPreview: (trigger: string) => unknown;
}

export type ChordSelectionCore = Pick<
  EditorCore,
  | 'scoreRef'
  | 'currentPageRef'
  | 'selectionProjectionNeededRef'
  | 'ensureSelectionInWasm'
  | 'runSerializedScoreOperation'
  | 'performMutation'
>;

export interface ChordSelectionInputs {
  readonly core: ChordSelectionCore;
  readonly view: SelectionView;
}

/** The note above or below the selected one (`top`: the chord's top or bottom note). False when it did not move. */
export async function moveInChord(
  { core, view }: ChordSelectionInputs,
  up: boolean,
  top: boolean,
): Promise<boolean> {
  const score = core.scoreRef.current;
  if (!score?.selectNoteInChord) return false;
  if (core.selectionProjectionNeededRef.current) await core.ensureSelectionInWasm();
  const moved = await core.runSerializedScoreOperation(
    () => score.selectNoteInChord!(up, top),
    'selectNoteInChord',
  );
  if (!moved) return false;
  core.selectionProjectionNeededRef.current = false;
  // Across staves the note can be on another page (a system break between them)
  const box = await score.getSelectionBoundingBox?.();
  const page = box && typeof box.page === 'number' ? box.page : core.currentPageRef.current;
  if (page !== core.currentPageRef.current) await view.goToPage(page);
  else await view.refreshSelectionFromSvg();
  void view.playSelectionPreview(top ? 'chord-top-bottom' : 'chord-up-down');
  return true;
}

/** R: the selection again, after itself, as one undoable edit (the engine refuses what it cannot repeat). */
export async function repeatSelection({ core }: ChordSelectionInputs): Promise<void> {
  const score = core.scoreRef.current;
  if (!score?.repeatSelection) return;
  if (core.selectionProjectionNeededRef.current) await core.ensureSelectionInWasm();
  await core.performMutation('repeat selection', () => score.repeatSelection!());
}
