import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useRegisterCommands } from '../../../lib/commands/useRegisterCommands';
import type { Score } from '../../../lib/webmscore-loader';
import { notifyError } from '../../shell/notices';
import { downloadBlob } from '../download-blob';
import { allPartsPdfArchive } from './exportAllParts';
import { buildPartCommands } from './partCommands';
import { safeFileStem } from './partFileName';
import type { RefreshPageCount, RenderScore } from '../editor-types';
import { getPartsSnapshot, setPartsSnapshot, subscribeToParts, type ScorePart } from './partsStore';

type Serialized = <T>(operation: () => Promise<T>, label: string) => Promise<T>;

export type PartsInputs = {
  score: Score | null;
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

async function readParts(target: Score, run: Serialized): Promise<ScorePart[]> {
  if (!target.listExcerpts) return [];
  try {
    return await run(() => target.listExcerpts!(), 'listExcerpts');
  } catch (error) {
    console.warn('Could not list the parts', error);
    return [];
  }
}

/** Clears the selection and draws the score the engine now acts on, from its first page. */
async function redraw(inputs: PartsInputs, target: Score) {
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

/**
 * Parts in the editor (roadmap E18, slice 1): the live score's parts listed, one shown at a time, and parts made from
 * the instruments when the score has none. Showing a part points every engine call (drawing, selection, edits,
 * playback, export) at it; the parts are linked, so edits reach the full score and the other parts as in MuseScore.
 * Commands: `view.part.show` (argument: -1 for the full score, else the part's index), `view.part.generate`, and
 * `file.export.parts` (every part and the full score as PDFs, in one ZIP).
 */
export function useScoreParts(inputs: PartsInputs) {
  const { score } = inputs;
  const { current, score: storeScore } = useSyncExternalStore(
    subscribeToParts,
    getPartsSnapshot,
    getPartsSnapshot,
  );
  // The latest inputs, for the effects
  const latest = useRef(inputs);
  useLayoutEffect(() => {
    latest.current = inputs;
  });

  // A new score shows its full score, and lists the parts it brought (a MuseScore file's own parts).
  useEffect(() => {
    drawnPart = -1;
    setPartsSnapshot({ score, parts: [], current: -1 });
    if (!score) return;
    let live = true;
    void readParts(score, latest.current.runSerialized).then((parts) => {
      if (live && getPartsSnapshot().score === score) setPartsSnapshot({ parts });
    });
    return () => {
      live = false;
    };
  }, [score]);

  useEffect(() => {
    if (!score || storeScore !== score || drawnPart === current) return;
    drawnPart = current;
    void redraw(latest.current, score);
  }, [current, storeScore, score]);

  // Made every render: useRegisterCommands keeps the latest behind stable registry entries.
  const commands = buildPartCommands(() => inputs);
  useRegisterCommands('global', commands);
}
