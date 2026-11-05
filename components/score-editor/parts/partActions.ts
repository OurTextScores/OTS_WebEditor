import type { Score } from '../../../lib/webmscore-loader';
import { notifyError } from '../../shell/notices';
import { downloadBlob } from '../download-blob';
import type { RefreshPageCount, RenderScore } from '../editor-types';
import { allPartsPdfArchive } from './exportAllParts';
import { safeFileStem } from './partFileName';
import { getPartsSnapshot, setPartsSnapshot, type ScorePart } from './partsStore';

/*
 * What the part commands do (roadmap E18): show a part, make parts, manage them, export them. No React here: the
 * command catalog (read by the server-rendered Help page) builds the part commands from this module.
 */

type Serialized = <T>(operation: () => Promise<T>, label: string) => Promise<T>;

export type PartsInputs = {
  score: Score | null;
  /** The undo position: an undo or redo can add or remove parts, so the list is read again. */
  undoIndex?: number;
  runSerialized: Serialized;
  renderScore: RenderScore;
  refreshPageCount: RefreshPageCount;
  clearSelection: () => void | Promise<void>;
};

/**
 * The part the canvas was last drawn for. A switch made elsewhere (ensureFullScore, before a whole-score read) changes
 * the store without drawing; the hook sees the difference and redraws. Module-level, like the store: one editor.
 */
let drawnPart = -1;
export const getDrawnPart = () => drawnPart;
export const setDrawnPart = (part: number) => {
  drawnPart = part;
};

export async function readParts(target: Score, run: Serialized): Promise<ScorePart[]> {
  if (!target.listExcerpts) return [];
  try {
    return await run(() => target.listExcerpts!(), 'listExcerpts');
  } catch (error) {
    console.warn('Could not list the parts', error);
    return [];
  }
}

/** Clears the selection and draws the score the engine now acts on, from its first page. */
export async function redraw(inputs: PartsInputs, target: Score) {
  await inputs.clearSelection();
  const page = await inputs.refreshPageCount(target, 0);
  await inputs.renderScore(target, page, false);
}

/** Shows the full score (-1) or a part, by its index. */
export async function show(inputs: PartsInputs, index: number) {
  const { score: target, current, parts } = getPartsSnapshot();
  if (!target?.setExcerptId || index === current) return;
  if (index !== -1 && (index < 0 || index >= parts.length)) return;
  await inputs.runSerialized(() => Promise.resolve(target.setExcerptId!(index)), 'setExcerptId');
  drawnPart = index;
  setPartsSnapshot({ current: index });
  await redraw(inputs, target);
}

/** Makes one part per instrument (a score without parts), then shows the first. */
export async function generate(inputs: PartsInputs) {
  const target = getPartsSnapshot().score;
  if (!target?.generateExcerpts) return;
  try {
    await inputs.runSerialized(() => target.generateExcerpts!(), 'generateExcerpts');
    const parts = await readParts(target, inputs.runSerialized);
    setPartsSnapshot({ parts });
    if (parts.length) await show(inputs, 0);
  } catch (error) {
    console.error('Failed to make parts', error);
    notifyError('Could not make parts from the instruments.');
  }
}

/**
 * Reads the parts again after a change to the list, and shows what should be shown: the part that was shown, at its
 * new index (`shownAfter`), or the full score when it is gone. Redraws when a part is shown (its content may have
 * changed: a reset).
 */
async function afterPartsChange(inputs: PartsInputs, shownAfter: number) {
  const target = getPartsSnapshot().score;
  if (!target) return;
  const parts = await readParts(target, inputs.runSerialized);
  const next = shownAfter >= 0 && shownAfter < parts.length ? shownAfter : -1;
  if (next !== getPartsSnapshot().current || next !== -1) {
    await inputs.runSerialized(() => Promise.resolve(target.setExcerptId?.(next)), 'setExcerptId');
    drawnPart = next;
    setPartsSnapshot({ parts, current: next });
    await redraw(inputs, target);
  } else {
    setPartsSnapshot({ parts });
  }
}

/**
 * After an undo or redo: only when it changed the parts (made, removed, renamed one) is the list read into the store;
 * the part shown stays shown if it is still there, else the full score is. Every other edit changes nothing here.
 */
export async function refreshAfterUndo(inputs: PartsInputs) {
  const target = getPartsSnapshot().score;
  if (!target) return;
  const parts = await readParts(target, inputs.runSerialized);
  if (JSON.stringify(parts) === JSON.stringify(getPartsSnapshot().parts)) return;
  const { current } = getPartsSnapshot();
  if (current >= parts.length) await afterPartsChange(inputs, -1);
  else setPartsSnapshot({ parts });
}

/** Manage parts (slice 4): a new part from the score's instruments, shown once made. */
export async function createPart(inputs: PartsInputs, name: string, partIndices: number[]) {
  const target = getPartsSnapshot().score;
  if (!target?.createExcerpt) return;
  const index = await inputs.runSerialized(
    () => target.createExcerpt!(name, partIndices),
    'createExcerpt',
  );
  if (index < 0) {
    notifyError('Choose at least one instrument for the part.');
    return;
  }
  await afterPartsChange(inputs, index);
}

export async function renamePart(inputs: PartsInputs, index: number, name: string) {
  const target = getPartsSnapshot().score;
  if (!target?.renameExcerpt) return;
  const renamed = await inputs.runSerialized(
    () => target.renameExcerpt!(index, name),
    'renameExcerpt',
  );
  if (!renamed) notifyError('A part needs a name of its own.');
  setPartsSnapshot({ parts: await readParts(target, inputs.runSerialized) });
}

export async function removePart(inputs: PartsInputs, index: number) {
  const target = getPartsSnapshot().score;
  if (!target?.removeExcerpt) return;
  const { current } = getPartsSnapshot();
  // The engine reads the part shown by its index: point it at the full score before the list changes under it.
  await inputs.runSerialized(() => Promise.resolve(target.setExcerptId?.(-1)), 'setExcerptId');
  await inputs.runSerialized(() => target.removeExcerpt!(index), 'removeExcerpt');
  await afterPartsChange(inputs, current === index ? -1 : current > index ? current - 1 : current);
}

export async function duplicatePart(inputs: PartsInputs, index: number) {
  const target = getPartsSnapshot().score;
  if (!target?.duplicateExcerpt) return;
  const { current } = getPartsSnapshot();
  await inputs.runSerialized(() => Promise.resolve(target.setExcerptId?.(-1)), 'setExcerptId');
  const copy = await inputs.runSerialized(
    () => target.duplicateExcerpt!(index),
    'duplicateExcerpt',
  );
  await afterPartsChange(inputs, copy >= 0 && current > index ? current + 1 : current);
}

export async function resetPart(inputs: PartsInputs, index: number) {
  const target = getPartsSnapshot().score;
  if (!target?.resetExcerpt) return;
  const { current } = getPartsSnapshot();
  await inputs.runSerialized(() => Promise.resolve(target.setExcerptId?.(-1)), 'setExcerptId');
  await inputs.runSerialized(() => target.resetExcerpt!(index), 'resetExcerpt');
  await afterPartsChange(inputs, current);
}

/** Every part and the full score as PDFs, in one ZIP named for the score (slice 2). */
export async function exportAllParts(inputs: PartsInputs) {
  const target = getPartsSnapshot().score;
  if (!target) return;
  try {
    const archive = await allPartsPdfArchive(target, inputs.runSerialized);
    if (!archive) return;
    const metadata = await Promise.resolve(target.metadata?.()).catch(() => null);
    const title = typeof metadata?.title === 'string' ? metadata.title : '';
    downloadBlob(archive, `${safeFileStem(title || 'score')} - parts.zip`, 'application/zip');
  } catch (error) {
    console.error('Failed to export the parts', error);
    notifyError('Could not export the parts.');
  }
}
