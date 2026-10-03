import { type GripEditInfo } from '../../../lib/webmscore-loader';
import { ESCAPE_PRIORITY, pushEscapeLayer } from '../../shell/keyboard/escapeLayers';
import { type SelectionFallback } from '../selection-types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RefreshPageCount, RenderScore } from '../editor-types';
import type { EditorCore } from '../core';

export type GripEditContext = {
  core: EditorCore;
  refreshPageCount: RefreshPageCount;
  renderScore: RenderScore;
  engravingToOverlayPoint: (x: number, y: number) => { x: number; y: number };
  refreshSelectionFromSvg: (fallback?: SelectionFallback) => Promise<void>;
  interactiveMutationEnabled: boolean;
};

/**
 * Editing a spanner or element through its grips: begin at a point, drag a grip with the pointer, commit or cancel (Escape, unmount).
 */
export function useGripEdit(ctx: GripEditContext) {
  const {
    core,
    refreshPageCount,
    renderScore,
    engravingToOverlayPoint,
    refreshSelectionFromSvg,
    interactiveMutationEnabled,
  } = ctx;
  const {
    clientToEngravingPoint,
    currentPageRef,
    noteInputActiveRef,
    score,
    setScoreDirtySinceCheckpoint,
    setScoreDirtySinceXml,
    zoom,
  } = core;

  const [gripEdit, setGripEdit] = useState<GripEditInfo | null>(null);

  const gripDragCleanupRef = useRef<(() => void) | null>(null);

  const closeGripEdit = useCallback(
    (commit: boolean) => {
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      setGripEdit(null);
      if (score?.endGripEdit) {
        void Promise.resolve(score.endGripEdit(commit)).catch((err: unknown) => {
          console.warn('Ending grip edit failed:', err);
        });
      }
    },
    [score],
  );

  const beginGripEditAtPoint = async (pageIndex: number, x: number, y: number) => {
    if (!interactiveMutationEnabled || noteInputActiveRef.current || !score?.beginGripEdit) {
      return;
    }
    try {
      const edit = await Promise.resolve(score.beginGripEdit(pageIndex, x, y));
      setGripEdit(edit?.grips?.length ? edit : null);
    } catch (err) {
      console.warn('Starting grip edit failed:', err);
      setGripEdit(null);
    }
  };

  const handleGripPointerDown = (event: React.PointerEvent, gripIndex: number) => {
    if (event.button !== 0 || !score?.dragGrip || !score?.endGripEdit || !gripEdit) {
      return;
    }
    const grip = gripEdit.grips.find((item) => item.index === gripIndex);
    if (!grip?.draggable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    gripDragCleanupRef.current?.();
    const pointerId = event.pointerId;
    const startClient = { x: event.clientX, y: event.clientY };
    const startEngraving = clientToEngravingPoint(event.clientX, event.clientY);
    const initial = gripEdit;

    const engravingDelta = (clientX: number, clientY: number) => {
      const current = clientToEngravingPoint(clientX, clientY);
      if (!startEngraving || !current) {
        return {
          dx: (clientX - startClient.x) / zoom,
          dy: (clientY - startClient.y) / zoom,
        };
      }
      return { dx: current.x - startEngraving.x, dy: current.y - startEngraving.y };
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const { dx, dy } = engravingDelta(moveEvent.clientX, moveEvent.clientY);
      setGripEdit({
        ...initial,
        grips: initial.grips.map((item) =>
          item.index === gripIndex ? { ...item, x: item.x + dx, y: item.y + dy } : item,
        ),
      });
      moveEvent.preventDefault();
    };

    const finish = async (upEvent: PointerEvent, commit: boolean) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      const { dx, dy } = engravingDelta(upEvent.clientX, upEvent.clientY);
      let committed = false;
      try {
        if (commit && (dx !== 0 || dy !== 0)) {
          const modifiers =
            (upEvent.shiftKey ? 1 : 0) | (upEvent.ctrlKey ? 2 : 0) | (upEvent.altKey ? 4 : 0);
          const updated = await Promise.resolve(score.dragGrip?.(gripIndex, dx, dy, modifiers));
          committed = Boolean(updated);
        }
        await Promise.resolve(score.endGripEdit?.(committed));
        setGripEdit(null);
        if (!committed) {
          return;
        }
        setScoreDirtySinceCheckpoint(true);
        setScoreDirtySinceXml(true);
        if (score.relayout) {
          await Promise.resolve(score.relayout());
        }
        const refreshedPage = await refreshPageCount(score, currentPageRef.current);
        await renderScore(score, refreshedPage);
        const selectionPoint = engravingToOverlayPoint(grip.x + dx, grip.y + dy);
        await refreshSelectionFromSvg({
          index: null,
          point: { page: initial.page, ...selectionPoint },
        });
      } catch (err) {
        console.error('Grip drag failed:', err);
        await Promise.resolve(score.endGripEdit?.(false)).catch(() => {});
        setGripEdit(null);
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      void finish(upEvent, true);
    };
    const onCancel = (cancelEvent: PointerEvent) => {
      void finish(cancelEvent, false);
    };
    // Escape cancels the drag: it is the innermost layer until the pointer is released.
    const popEscape = pushEscapeLayer(ESCAPE_PRIORITY.gesture, () => {
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      setGripEdit(null);
      void Promise.resolve(score.endGripEdit?.(false)).catch(() => {});
    });

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    gripDragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      popEscape();
    };
  };

  // Unmounting ends a grip edit that is still in flight.
  useEffect(
    () => () => {
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      void Promise.resolve(score?.endGripEdit?.(false)).catch(() => {});
    },
    [score, gripDragCleanupRef],
  );

  return { beginGripEditAtPoint, closeGripEdit, gripEdit, handleGripPointerDown };
}
