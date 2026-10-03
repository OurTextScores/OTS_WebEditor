import { ELEMENT_SELECTION_SELECTOR } from '../selection-classes';
import { type SelectionBox, type SelectionFallback } from '../selection-types';
import type { EditorCore } from '../core';

export type MarqueeRect = { x: number; y: number; w: number; h: number };

const boxesIntersect = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x + a.w >= b.x && b.x + b.w >= a.x && a.y + a.h >= b.y && b.y + b.h >= a.y;

/**
 * Selects everything the rectangle touches (adding to the selection when additive) and returns the selection to show while the engine catches up.
 */
export async function performDragSelection(
  core: EditorCore,
  rect: MarqueeRect,
  additive: boolean,
): Promise<SelectionFallback> {
  const {
    clientToEngravingPoint,
    containerRef,
    resolvePageIndex,
    score,
    setSelectedElement,
    setSelectedElementClasses,
    setSelectedIndex,
    setSelectedLayoutBreakSubtype,
    setSelectedPoint,
    setSelectionBoxes,
    zoom,
  } = core;
  if (!containerRef.current || !score) {
    return null;
  }

  const containerRect = containerRef.current.getBoundingClientRect();
  const allElements = Array.from(containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR));

  const hits = allElements
    .map((el, index) => {
      const elRect = el.getBoundingClientRect();
      const box = {
        x: (elRect.left - containerRect.left) / zoom,
        y: (elRect.top - containerRect.top) / zoom,
        w: elRect.width / zoom,
        h: elRect.height / zoom,
      };
      if (!(box.w > 0 && box.h > 0)) {
        return null;
      }
      if (!boxesIntersect(rect, box)) {
        return null;
      }
      const pageIndex = resolvePageIndex(el);
      const centerX = box.x + box.w / 2;
      const centerY = box.y + box.h / 2;
      const engravingPoint = clientToEngravingPoint(
        elRect.left + elRect.width / 2,
        elRect.top + elRect.height / 2,
        el,
      );
      const selectionX = engravingPoint?.x ?? centerX;
      const selectionY = engravingPoint?.y ?? centerY;
      return { el, index, pageIndex, box, centerX, centerY, selectionX, selectionY };
    })
    .filter((hit): hit is NonNullable<typeof hit> => Boolean(hit))
    .sort(
      (a, b) =>
        a.pageIndex - b.pageIndex || a.box.y - b.box.y || a.box.x - b.box.x || a.index - b.index,
    );

  if (hits.length === 0) {
    if (!additive) {
      setSelectedElement(null);
      setSelectionBoxes([]);
      setSelectedPoint(null);
      setSelectedIndex(null);
      setSelectedElementClasses('');
      setSelectedLayoutBreakSubtype(null);
      if (score.clearSelection) {
        await Promise.resolve(score.clearSelection()).catch((err: unknown) => {
          console.warn('clearSelection not available or failed:', err);
        });
      }
    }
    return null;
  }

  const first = hits[0];
  const hitBoxes: SelectionBox[] = hits.map((hit) => ({
    index: hit.index,
    page: hit.pageIndex,
    x: hit.box.x,
    y: hit.box.y,
    w: hit.box.w,
    h: hit.box.h,
    centerX: hit.centerX,
    centerY: hit.centerY,
    classes: hit.el.getAttribute('class') ?? '',
  }));
  if (additive) {
    setSelectionBoxes((prev) => {
      const seen = new Set<number>();
      for (const box of prev) {
        if (box.index !== null) {
          seen.add(box.index);
        }
      }
      const merged = [...prev];
      for (const box of hitBoxes) {
        if (box.index !== null && seen.has(box.index)) {
          continue;
        }
        if (box.index !== null) {
          seen.add(box.index);
        }
        merged.push(box);
      }
      return merged;
    });
  } else {
    setSelectionBoxes(hitBoxes);
  }
  setSelectedElement(first.box);
  setSelectedPoint({ page: first.pageIndex, x: first.centerX, y: first.centerY });
  setSelectedIndex(first.index);

  const fallback: SelectionFallback = {
    index: first.index,
    point: {
      page: first.pageIndex,
      x: first.centerX,
      y: first.centerY,
    },
  };

  if (score.selectElementAtPointWithMode) {
    // Check if any hits are notes - notes need RANGE selection for copy/paste to work
    const hasNotes = hits.some((hit) => {
      const classes = hit.el.getAttribute('class') ?? '';
      return classes.includes('Note');
    });

    const firstMode = additive ? 1 : 0;

    if (hasNotes && hits.length > 1) {
      // For notes, use RANGE selection (mode 3) to enable copy/paste
      // Find leftmost and rightmost hits (by x position) for proper time-based range
      let leftmost = hits[0];
      let rightmost = hits[0];
      for (const hit of hits) {
        if (hit.box.x < leftmost.box.x) {
          leftmost = hit;
        }
        if (hit.box.x + hit.box.w > rightmost.box.x + rightmost.box.w) {
          rightmost = hit;
        }
      }
      // Select leftmost first, then extend range to rightmost
      await score.selectElementAtPointWithMode(
        leftmost.pageIndex,
        leftmost.selectionX,
        leftmost.selectionY,
        firstMode,
      );
      await score.selectElementAtPointWithMode(
        rightmost.pageIndex,
        rightmost.selectionX,
        rightmost.selectionY,
        3,
      );
    } else {
      // For non-note elements (slurs, dynamics, etc.), use ADD mode (original behavior)
      await score.selectElementAtPointWithMode(
        first.pageIndex,
        first.selectionX,
        first.selectionY,
        firstMode,
      );
      for (let i = 1; i < hits.length; i++) {
        const hit = hits[i];
        await score.selectElementAtPointWithMode(hit.pageIndex, hit.selectionX, hit.selectionY, 1);
      }
    }
    return fallback;
  }

  if (!score.selectElementAtPoint) {
    console.warn('selectElementAtPoint is not available; cannot update selection in WASM');
    return fallback;
  }

  if (!additive && score.clearSelection) {
    await Promise.resolve(score.clearSelection()).catch((err: unknown) => {
      console.warn('clearSelection not available or failed:', err);
    });
  }

  await score.selectElementAtPoint(first.pageIndex, first.selectionX, first.selectionY);
  return fallback;
}
