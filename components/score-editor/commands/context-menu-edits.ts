import { promptForText } from '../prompt-for-text';
import type { EditorCore } from '../core';

/**
 * The edits the score's type-specific context menus bring (MuseScore's frame Add ▸ menu, Add
 * fretboard diagram on a chord symbol, Snap to previous / next, and note input's right-click),
 * each one engine command.
 */

/**
 * These act on what the engine holds: the right-click selected it there, or kept the selection the
 * engine had (as MuseScore does). The editor's remembered selection point can be stale or useless for
 * them (a hairpin's centre is empty space), so they neither re-project it before the edit nor reselect
 * it after, and the edited element stays selected.
 */
const ENGINE_SELECTION = { skipWasmReselect: true, skipSelectionFallback: true } as const;

/** A frame's Add ▸ entries, in MuseScore's order: the engine's `addFrameText` kind. */
export const FRAME_TEXT_KINDS = [
  { kind: 0, label: 'Text' },
  { kind: 1, label: 'Title' },
  { kind: 2, label: 'Subtitle' },
  { kind: 3, label: 'Composer' },
  { kind: 4, label: 'Lyricist' },
  { kind: 5, label: 'Part Name' },
] as const;

export type FrameTextKind = (typeof FRAME_TEXT_KINDS)[number]['kind'];

/** Adds text of `kind` to the selected frame, asking for the text first. */
export async function addFrameText(core: EditorCore, kind: FrameTextKind) {
  const { performMutation, requireMutation } = core;
  const label = FRAME_TEXT_KINDS[kind].label;
  const text = await promptForText(`${label}:`);
  if (text === null) return;
  return performMutation(`add frame ${label.toLowerCase()}`, async () => {
    const fn = requireMutation('addFrameText');
    if (!fn) return false;
    return fn(kind, text);
  }, ENGINE_SELECTION);
}

/** A diagram of each selected chord symbol's chord, with the symbol moved onto it. */
export function addFretboardForHarmony(core: EditorCore) {
  const { performMutation, requireMutation } = core;
  return performMutation('add fretboard diagram', async () => {
    const fn = requireMutation('addFretboardDiagramForHarmony');
    if (!fn) return false;
    return fn();
  }, ENGINE_SELECTION);
}

/** Snap to previous (0) or next (1) for the selected hairpins and gradual tempo changes. */
export function toggleSnap(core: EditorCore, which: 0 | 1) {
  const { performMutation, requireMutation } = core;
  return performMutation(which === 0 ? 'toggle snap to previous' : 'toggle snap to next', async () => {
    const fn = requireMutation('toggleSnap');
    if (!fn) return false;
    return fn(which);
  }, ENGINE_SELECTION);
}

/** Note input's right-click: the note at the point becomes a rest, as put-note's opposite. */
export function removeNoteAtPoint(core: EditorCore, page: number, x: number, y: number) {
  const { performMutation, requireMutation } = core;
  return performMutation(
    'delete note',
    async () => {
      const fn = requireMutation('removeNoteAtPoint');
      if (!fn) return false;
      return fn(page, x, y);
    },
    ENGINE_SELECTION,
  );
}
