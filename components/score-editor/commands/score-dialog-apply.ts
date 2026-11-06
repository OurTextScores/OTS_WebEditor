import type { EditorCore } from '../core';
import type { ScoreDialogKind } from '../score-dialogs';

const LABELS: Record<ScoreDialogKind, string> = {
  pageSettings: 'edit page settings',
  style: 'edit style',
  measureProperties: 'edit measure properties',
  selectMore: 'select more',
  realizeHarmony: 'realize chord symbols',
  staffProperties: 'edit staff properties',
  changeInstrument: 'change instrument',
  harpPedals: 'edit harp pedals',
  timeSigProperties: 'edit time signature properties',
  staffTextProperties: 'edit staff text properties',
  systemTextProperties: 'edit system text properties',
};

/**
 * Runs a settings dialog's apply. Select ▸ More… only changes the selection, so it runs on the score's queue and
 * the selection is redrawn; the others are edits. Like the context-menu edits they act on what the engine holds
 * (a dialog opened from the menu acts on what was right-clicked), so nothing is re-projected or reselected.
 */
export async function applyScoreDialog(
  core: Pick<EditorCore, 'performMutation' | 'runSerializedScoreOperation'>,
  refresh: {
    setHasBackendHighlighting: (value: boolean) => void;
    refreshSelectionFromSvg: () => Promise<void>;
  },
  kind: ScoreDialogKind,
  apply: () => Promise<boolean>,
) {
  if (kind === 'selectMore') {
    const selected = await core.runSerializedScoreOperation(apply, LABELS[kind]);
    if (!selected) return false;
    refresh.setHasBackendHighlighting(false);
    await refresh.refreshSelectionFromSvg();
    return true;
  }
  return core.performMutation(LABELS[kind], apply, {
    skipWasmReselect: true,
    skipSelectionFallback: true,
  });
}

/** Load Style: a MuseScore style file (.mss) replaces the score's style, as one undoable edit. */
export async function loadStyleFile(
  core: Pick<EditorCore, 'performMutation' | 'requireMutation'>,
  file: File,
) {
  const data = new Uint8Array(await file.arrayBuffer());
  return core.performMutation('load style', async () => {
    const fn = core.requireMutation('loadStyle');
    if (!fn) return false;
    return fn(data);
  });
}

/** Add ▸ Image: an image file into the selected frame, typed by its extension. */
export async function addImageToFrame(
  core: Pick<EditorCore, 'performMutation' | 'requireMutation'>,
  file: File,
) {
  const suffix = file.name.split('.').pop()?.toLowerCase() ?? '';
  const data = new Uint8Array(await file.arrayBuffer());
  return core.performMutation(
    'add image',
    async () => {
      const fn = core.requireMutation('addImageToFrame');
      if (!fn) return false;
      return fn(suffix, data);
    },
    { skipWasmReselect: true, skipSelectionFallback: true },
  );
}
