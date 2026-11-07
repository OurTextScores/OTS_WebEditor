import { notify } from '../../shell/notices';
import type { EditorCore } from '../core';

/** Where Select ▸ Similar takes its pattern from: the right-clicked element, on a page. */
export interface SimilarPattern {
  readonly page: number;
  readonly x: number;
  readonly y: number;
}

export type SimilarScope = 'all' | 'staff' | 'range';

const MODE: Record<SimilarScope, 0 | 1 | 2> = { all: 0, staff: 1, range: 2 };

/**
 * MuseScore's Select ▸ Similar, Similar on this staff and Similar in this range (the
 * engine's Score::selectSimilar / selectSimilarInRange). The pattern is the element at
 * `at`, as MuseScore uses the element last clicked; without a point it is the single
 * selection. The result is a list selection, redrawn and read back from the SVG.
 */
export async function selectSimilar(
  core: Pick<EditorCore, 'requireMutation' | 'runSerializedScoreOperation'>,
  refresh: { setHasBackendHighlighting: (value: boolean) => void; refreshSelectionFromSvg: () => Promise<void> },
  scope: SimilarScope,
  at?: SimilarPattern,
): Promise<boolean> {
  const select = core.requireMutation('selectSimilar');
  if (!select) return false;
  // In a range MuseScore patterns on the element last clicked; from the keyboard there is none.
  if (scope === 'range' && !at) {
    notify({ kind: 'info', title: 'Right-click an element in the range to select ones like it.' });
    return false;
  }
  const selected = await core.runSerializedScoreOperation(
    async () => Boolean(await select(MODE[scope], at?.page ?? -1, at?.x ?? 0, at?.y ?? 0)),
    'select similar',
  );
  if (!selected) return false;
  refresh.setHasBackendHighlighting(false);
  await refresh.refreshSelectionFromSvg();
  return true;
}
