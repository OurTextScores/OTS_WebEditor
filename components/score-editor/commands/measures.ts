import { type MeasureInsertTarget } from '../editorProps';
import { measureInsertTargetMap } from '../layout-constants';
import type { EditorCore } from '../core';

export function deleteSelection(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'delete selection',
    async () => {
      await ensureSelectionInWasm();
      const del = requireMutation('deleteSelection');
      if (!del) {
        return false;
      }
      return await del();
    },
    { clearSelection: true },
  );
}

export function insertMeasures(core: EditorCore, count: number, target: MeasureInsertTarget) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation('insert measures', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('insertMeasures');
    if (!fn) return false;
    const sanitized = Math.max(1, Math.floor(count));
    const targetValue = measureInsertTargetMap[target] ?? measureInsertTargetMap['after-selection'];
    return fn(sanitized, targetValue);
  });
}

export function addPickup(core: EditorCore, numerator: number, denominator: number) {
  const { performMutation, requireMutation } = core;
  return performMutation('add pickup measure', async () => {
    const fn = requireMutation('addPickupMeasure');
    if (!fn) return false;
    return fn(numerator, denominator);
  });
}

// Deletes the measures the current selection sits in. ensureSelectionInWasm is
// required because the engine resolves the measure range from its own selection
// state, which a UI-side selection has not necessarily reached yet.
export function removeContainingMeasures(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'remove containing measures',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('removeSelectedMeasures');
      if (!fn) return false;
      return fn();
    },
    { clearSelection: true, skipWasmReselect: true },
  );
}

export function removeTrailingEmptyMeasures(core: EditorCore) {
  const { performMutation, requireMutation } = core;
  return performMutation(
    'remove trailing empty measures',
    async () => {
      const fn = requireMutation('removeTrailingEmptyMeasures');
      if (!fn) return false;
      return fn();
    },
    { clearSelection: true, skipWasmReselect: true },
  );
}

export function toggleLineBreak(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'toggle line break',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('toggleLineBreak');
      if (!fn) return;
      return fn();
    },
    { skipWasmReselect: true },
  );
}

export function togglePageBreak(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'toggle page break',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('togglePageBreak');
      if (!fn) return;
      return fn();
    },
    { skipWasmReselect: true },
  );
}

export function toggleRepeatStart(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'toggle repeat start',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('toggleRepeatStart');
      if (!fn) return;
      return fn();
    },
    { incrementalLayout: true },
  );
}

export function toggleRepeatEnd(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'toggle repeat end',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('toggleRepeatEnd');
      if (!fn) return;
      return fn();
    },
    { incrementalLayout: true },
  );
}

export function setRepeatCount(core: EditorCore, count: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    `set repeat count ${count}`,
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setRepeatCount');
      if (!fn) return;
      return fn(count);
    },
    { incrementalLayout: true },
  );
}

export function setBarLineType(core: EditorCore, barLineType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    `set barline type ${barLineType}`,
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setBarLineType');
      if (!fn) return;
      return fn(barLineType);
    },
    { incrementalLayout: true },
  );
}

export function addVolta(core: EditorCore, endingNumber: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(`add volta ${endingNumber}`, async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addVolta');
    if (!fn) return;
    return fn(endingNumber);
  });
}

export function addMarker(core: EditorCore, markerType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add navigation marker',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addMarker');
      if (!fn) return false;
      return fn(markerType);
    },
    { incrementalLayout: true },
  );
}

export function addJump(core: EditorCore, jumpType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add playback jump',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addJump');
      if (!fn) return false;
      return fn(jumpType);
    },
    { incrementalLayout: true },
  );
}

export function addMeasureRepeat(core: EditorCore, numMeasures: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add measure repeat',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addMeasureRepeat');
      if (!fn) return false;
      return fn(numMeasures);
    },
    { skipWasmReselect: true, skipSelectionFallback: true },
  );
}
