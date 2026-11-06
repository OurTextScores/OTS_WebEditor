import { defaultCommandRegistry } from '../../../lib/commands/registry';
import type { EditorCore } from '../core';
import { setDropBoxes } from './rangeDropStore';

/*
 * Range drop (roadmap E11), as desktop MuseScore: with a range selected, Alt+click or Alt+drag pastes a copy of it where
 * the pointer is released, outlined where it would land while the pointer moves. A click without moving keeps the
 * range's place in the bar (desktop's preserveMeasureAlignment); after moving it starts at the note or rest under the
 * pointer. Escape cancels. The engine places and pastes it (bridge rangedrop.h), one undoable "Copy range".
 */

export type RangeDropCore = Pick<
  EditorCore,
  | 'scoreRef'
  | 'clientToEngravingPoint'
  | 'resolvePageIndex'
  | 'runSerializedScoreOperation'
  | 'performMutation'
>;

/** How far (CSS pixels) the pointer moves before a click becomes a drag, as desktop's 4 physical pixels. */
const DRAG_THRESHOLD = 4;

type At = { page: number; x: number; y: number };

function pointAt(core: RangeDropCore, clientX: number, clientY: number): At | null {
  const target = document.elementFromPoint(clientX, clientY);
  const point = core.clientToEngravingPoint(clientX, clientY, target);
  return point ? { page: core.resolvePageIndex(target), x: point.x, y: point.y } : null;
}

/**
 * Starts a range drop for an Alt+pointer-down, when a range is selected and the engine can drop one. Returns whether
 * it took the gesture (the caller then leaves it alone). Listens on the window until the pointer is released.
 */
export function startRangeDrop(
  core: RangeDropCore,
  event: React.PointerEvent | PointerEvent,
): boolean {
  const score = core.scoreRef.current;
  if (!event.altKey || event.button !== 0 || !score?.rangeDropPreview || !score.dropRangeAt)
    return false;
  if (defaultCommandRegistry.getContext().selection !== 'range') return false;
  const origin = { x: event.clientX, y: event.clientY };
  let at = pointAt(core, origin.x, origin.y);
  if (!at) return false;
  event.preventDefault();
  event.stopPropagation();

  let moved = false;
  let active = true;
  let previewing = false;
  let pending = false;
  const preview = async () => {
    // One preview in flight; the latest position is previewed after it
    if (previewing) {
      pending = true;
      return;
    }
    previewing = true;
    do {
      pending = false;
      const target = at;
      if (!target) break;
      const boxes = await core.runSerializedScoreOperation(
        () => score.rangeDropPreview!(target.page, target.x, target.y, !moved),
        'rangeDropPreview',
      );
      if (active) setDropBoxes(Array.isArray(boxes) ? boxes : []);
    } while (pending && active);
    previewing = false;
  };

  const finish = () => {
    active = false;
    setDropBoxes([]);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('keydown', onKey, true);
    // The click that follows the release would select what is under the pointer instead
    window.addEventListener(
      'click',
      (click) => {
        click.stopPropagation();
        click.preventDefault();
      },
      { capture: true, once: true },
    );
  };
  const onMove = (move: PointerEvent) => {
    if (!moved && Math.hypot(move.clientX - origin.x, move.clientY - origin.y) > DRAG_THRESHOLD)
      moved = true;
    at = pointAt(core, move.clientX, move.clientY) ?? at;
    void preview();
  };
  const onUp = (up: PointerEvent) => {
    at = pointAt(core, up.clientX, up.clientY) ?? at;
    const target = at;
    const alignToBar = !moved;
    finish();
    if (target) {
      void core.performMutation('copy range', () =>
        score.dropRangeAt!(target.page, target.x, target.y, alignToBar),
      );
    }
  };
  const onKey = (key: KeyboardEvent) => {
    if (key.key !== 'Escape') return;
    key.preventDefault();
    key.stopPropagation();
    finish();
  };
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('keydown', onKey, true);
  void preview();
  return true;
}
