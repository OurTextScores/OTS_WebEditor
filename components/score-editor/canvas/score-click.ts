import {
  ELEMENT_SELECTION_SELECTOR,
  hasSelectableClass,
  isSvgTextElement,
  normalizeElementClasses,
  resolveTextElement,
} from '../selection-classes';
import { type SelectionBox, type SelectionFallback } from '../selection-types';
import React from 'react';
import type { GripEditInfo as GripEdit } from '../../../lib/webmscore-loader';
import type { CanvasGesturesContext } from './useCanvasGestures';

export type ScoreClickContext = Pick<
  CanvasGesturesContext,
  | 'core'
  | 'clientToScorePoint'
  | 'ignoreNextClickRef'
  | 'renderScore'
  | 'refreshSelectionFromSvg'
  | 'scheduleSelectionOverlayRefresh'
  | 'playSelectionPreview'
  | 'interactionReady'
  | 'interactiveMutationEnabled'
  | 'handlePutNoteAtPoint'
  | 'setHasBackendHighlighting'
  | 'selectionInFlightRef'
  | 'gestureLateInputs'
> & {
  gripEdit: GripEdit | null;
  closeGripEdit: (commit: boolean) => void;
};

/** A click on the score canvas: selecting an element, a bar or a range, text editing, note input, and everything a click can mean in each mode. */
export function handleScoreClickImpl(ctx: ScoreClickContext, e: React.MouseEvent) {
  const {
    core,
    clientToScorePoint,
    ignoreNextClickRef,
    renderScore,
    refreshSelectionFromSvg,
    playSelectionPreview,
    interactionReady,
    interactiveMutationEnabled,
    handlePutNoteAtPoint,
    setHasBackendHighlighting,
    selectionInFlightRef,
    gripEdit,
    closeGripEdit,
    gestureLateInputs,
  } = ctx;
  const {
    clientToEngravingPoint,
    containerRef,
    noteInputActiveRef,
    resolvePageIndex,
    score,
    selectedIndex,
    selectionBoxes,
    selectionOverlayGenerationRef,
    setSelectedElement,
    setSelectedElementClasses,
    setSelectedIndex,
    setSelectedLayoutBreakSubtype,
    setSelectedPoint,
    setSelectionBoxes,
    zoom,
  } = core;

  if (!interactionReady) {
    return;
  }
  if (gripEdit) {
    closeGripEdit(false);
  }
  if (ignoreNextClickRef.current) {
    ignoreNextClickRef.current = false;
    return;
  }
  if (!containerRef.current || !score) return;

  // Invalidate any overlay refresh scheduled by a previous click (double-RAF
  // in refreshSelectionFromSvg/scheduleSelectionOverlayRefresh) before it fires.
  // Without this, a stale refreshSelectionOverlay callback from an earlier
  // element click can land after this click's selection is already applied,
  // scrape a DOM that has no .selected markers for a backend-highlighted
  // range (see renderScore's highlightSelection path), find nothing, and wipe
  // selectionBoxes/selectedElement -- see docs/private/SELECTION_WORK_HANDOFF.md §3.
  selectionOverlayGenerationRef.current += 1;

  if (noteInputActiveRef.current && interactiveMutationEnabled) {
    const scorePoint = clientToScorePoint(e.clientX, e.clientY);
    if (scorePoint) {
      const pageIndex = resolvePageIndex(e.target as Element | null);
      void handlePutNoteAtPoint(pageIndex, scorePoint.x, scorePoint.y);
    }
    return;
  }

  const clearSelectionState = gestureLateInputs.current.clearEditorSelection;

  const additiveSelection = e.metaKey || e.ctrlKey || e.shiftKey;
  const isShiftClick = e.shiftKey && !e.metaKey && !e.ctrlKey;
  // DOM-based hit testing
  const target = e.target as Element;

  // Check if we clicked on a Note or Rest (or other interesting elements)
  // webmscore SVG classes: Note, Rest, Chord, etc.
  // Often the target is a <path> or <g> with the class.

  // Traverse up to find a relevant class if needed
  // Note: containerRef.current is a div that contains the SVG, so we need to traverse
  // up through the SVG structure to find Note/Rest/Chord/LayoutBreak elements
  let element: Element | null = target;
  let found = false;

  while (element) {
    const classAttr = element.getAttribute('class');
    if (hasSelectableClass(classAttr)) {
      found = true;
      break;
    }
    if (isSvgTextElement(element)) {
      found = true;
      element = resolveTextElement(element);
      break;
    }
    // Stop if we've reached containerRef or gone past it
    if (element === containerRef.current || element.parentElement === null) {
      break;
    }
    element = element.parentElement;
  }

  if (!found || !element) {
    if (score?.selectMeasureAtPoint || score?.selectElementAtPoint) {
      const scorePoint = clientToScorePoint(e.clientX, e.clientY);
      if (!scorePoint) {
        clearSelectionState();
        return;
      }
      const pageIndex = resolvePageIndex(target);
      const fallback: SelectionFallback = {
        index: null,
        point: { page: pageIndex, x: scorePoint.x, y: scorePoint.y },
      };

      // Try selectElementAtPoint first, then fall back to selectMeasureAtPoint
      // Desktop MuseScore's Ctrl+Click on empty bar space does not build a list
      // selection (Score::selectAdd, score.cpp:2984): it either replaces the
      // range with the newly clicked bar, or -- when re-clicking the bar that
      // is already the sole selection -- toggles it off
      // (NotationInteraction::doSelect deselects on a Ctrl-click of an
      // already-selected item). Bars never join a List upstream, and measure
      // deletion (cmdTimeDelete) requires SelState::RANGE and refuses a List
      // outright, so there is no "add this bar too, keep the others" to build.
      // The only behaviour that isn't already the default replace-click is the
      // toggle-off, handled below.
      const isCtrlClick = (e.ctrlKey || e.metaKey) && !e.shiftKey;

      const trySelect = async (): Promise<boolean | 'cleared'> => {
        // Desktop MuseScore maps Shift+Click to SelectType::RANGE and plain
        // click to SINGLE (notationviewinputcontroller.cpp). Mode 3 is RANGE,
        // so shift-clicking another bar -- including one on a different staff
        // -- widens the existing selection instead of replacing it.
        //
        // This has to go through the measure path, not the element one: empty
        // space inside a bar matches no selectable item, so selectElementAtPoint
        // returns false and bar selection actually comes from the
        // selectMeasureAtPoint fallback below. The extend variant is that same
        // lookup without the deselectAll, so the range widens instead.
        if (isShiftClick && score.extendMeasureSelectionAtPoint) {
          const extended = await score.extendMeasureSelectionAtPoint(
            pageIndex,
            scorePoint.x,
            scorePoint.y,
          );
          if (extended) {
            return true;
          }
        }
        if (score.selectElementAtPoint) {
          const elementSelected = await score.selectElementAtPoint(
            pageIndex,
            scorePoint.x,
            scorePoint.y,
          );
          if (elementSelected) {
            return true;
          }
        }

        // If no element was selected, try selecting the measure
        if (score.selectMeasureAtPoint) {
          const readMeasureRange = async () => {
            if (!score.selectionMeasureRange) {
              return null;
            }
            try {
              return await score.selectionMeasureRange();
            } catch {
              return null;
            }
          };

          const previousRange = isCtrlClick ? await readMeasureRange() : null;

          const measureSelected = await score.selectMeasureAtPoint(
            pageIndex,
            scorePoint.x,
            scorePoint.y,
          );
          if (!measureSelected) {
            return false;
          }

          if (
            isCtrlClick &&
            score.clearSelection &&
            previousRange &&
            previousRange.startMeasureIndex === previousRange.endMeasureIndex
          ) {
            const newRange = await readMeasureRange();
            const sameSingleBar =
              newRange &&
              newRange.startMeasureIndex === previousRange.startMeasureIndex &&
              newRange.endMeasureIndex === previousRange.endMeasureIndex;
            if (sameSingleBar) {
              await score.clearSelection();
              return 'cleared' as const;
            }
          }

          return Boolean(measureSelected);
        }

        return false;
      };

      trySelect()
        .then(async (selected) => {
          if (selected === false || selected === 'cleared') {
            clearSelectionState();
            return;
          }

          // Get selection bounding boxes for keyboard/button enablement
          let hasMeasureSelection = false;
          if (score.getSelectionBoundingBoxes) {
            try {
              const bboxes = await score.getSelectionBoundingBoxes();
              if (bboxes && bboxes.length > 0) {
                hasMeasureSelection = true;
                // Set boxes for state tracking (keyboard shortcuts, button states)
                // Set backend highlighting flag to skip visual rendering (backend handles it)
                const boxes: SelectionBox[] = bboxes.map((bb, index) => {
                  const x = bb.x;
                  const y = bb.y;
                  const w = bb.width;
                  const h = bb.height;
                  const page = bb.page;
                  return {
                    index,
                    page,
                    x,
                    y,
                    w,
                    h,
                    centerX: x + w / 2,
                    centerY: y + h / 2,
                    classes: 'Measure',
                  };
                });
                setSelectionBoxes(boxes);
                setHasBackendHighlighting(true);
              }
            } catch (err) {
              console.warn('[ScoreEditor] Failed to get selection bounding boxes:', err);
            }
          }

          // Render with backend highlighting
          // For measure selections, skip overlay refresh to preserve selectionBoxes state
          if (hasMeasureSelection) {
            await renderScore(score, pageIndex);
            void playSelectionPreview('selection-click:measure', fallback.point);
          } else {
            // For single element selections, use normal flow with overlay
            setHasBackendHighlighting(false);
            await refreshSelectionFromSvg();
            void playSelectionPreview('selection-click:element', fallback.point, {
              reselect: true,
            });
          }
        })
        .catch((err) => {
          console.warn('selectMeasureAtPoint/selectElementAtPoint not available or failed:', err);
          clearSelectionState();
        });
      return;
    }
    clearSelectionState();
    return;
  }

  const targetElement = element;
  const rect = targetElement.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();

  const x = (rect.left - containerRect.left) / zoom;
  const y = (rect.top - containerRect.top) / zoom;
  const w = rect.width / zoom;
  const h = rect.height / zoom;

  if (w > 0 && h > 0) {
    const pageIndex = resolvePageIndex(targetElement);
    // Use center of the box for selection to reduce edge misses
    const centerX = x + w / 2;
    const centerY = y + h / 2;

    // Find the index by looking for Note/Rest/Chord/LayoutBreak elements
    // If we found a specific element, use it; otherwise search from target
    const allElements = Array.from(
      containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
    );
    let index = -1;

    if (found && element) {
      // We found a Note/Rest/Chord/LayoutBreak element, try to find its index
      index = allElements.indexOf(element);
    }

    // If still not found, try targetElement
    if (index < 0) {
      index = allElements.indexOf(targetElement);
    }

    // If still not found, try to find closest parent that's in the list
    if (index < 0 && targetElement) {
      let current: Element | null = targetElement;
      while (current && current !== containerRef.current) {
        index = allElements.indexOf(current);
        if (index >= 0) break;
        current = current.parentElement;
      }
    }

    const classAttr = normalizeElementClasses(
      targetElement,
      targetElement.getAttribute('class') ?? '',
    );
    const box: SelectionBox = {
      index: index >= 0 ? index : null,
      page: pageIndex,
      x,
      y,
      w,
      h,
      centerX,
      centerY,
      classes: classAttr,
    };
    const fallback: SelectionFallback = {
      index: box.index,
      point: { page: pageIndex, x: centerX, y: centerY },
    };

    const canModeSelect = Boolean(score?.selectElementAtPointWithMode);
    const alreadySelected =
      additiveSelection &&
      box.index !== null &&
      selectionBoxes.some((existing) => existing.index === box.index);
    // Mode: 0 = replace, 1 = add, 2 = toggle, 3 = range
    // Use range selection (mode 3) for shift-click when there's already a selection
    const hasExistingSelection = selectionBoxes.length > 0;
    const mode = canModeSelect
      ? additiveSelection
        ? alreadySelected
          ? 2 // Toggle off if already selected
          : isShiftClick && hasExistingSelection
            ? 3 // Range selection for shift-click
            : 1 // Add selection for ctrl/cmd-click
        : 0 // Replace selection
      : null;

    // DOM overlay coordinates are in the wrapper's CSS space, while
    // engine hit testing expects the SVG's engraving coordinate space.
    const engravingPoint = clientToEngravingPoint(e.clientX, e.clientY, targetElement);
    const selectionX = engravingPoint?.x ?? centerX;
    const selectionY = engravingPoint?.y ?? centerY;

    const selectionPromise = canModeSelect
      ? score.selectElementAtPointWithMode!(
          pageIndex,
          selectionX,
          selectionY,
          mode as 0 | 1 | 2 | 3,
        )
      : score.selectElementAtPoint?.(pageIndex, selectionX, selectionY);

    if (selectionPromise !== undefined) {
      const selectionRun = Promise.resolve(selectionPromise);
      selectionInFlightRef.current = selectionRun;
      void selectionRun
        .then((selected) => {
          if (selected === false) {
            throw new Error('selectElementAtPoint returned false');
          }
          return refreshSelectionFromSvg(fallback);
        })
        .then(() => {
          void playSelectionPreview(
            'selection-click:element',
            fallback.point,
            // The click RPC above already established the engine
            // selection. Replaying it races immediate copy/paste and can
            // replace the destination after the command was dispatched.
            { reselect: false },
          );
        })
        .catch((err) => {
          console.warn('selectElementAtPoint not available or failed:', err);
          setSelectedElement(null);
          setSelectionBoxes([]);
          setSelectedPoint(null);
          setSelectedIndex(null);
          setSelectedElementClasses('');
          setSelectedLayoutBreakSubtype(null);
        })
        .finally(() => {
          if (selectionInFlightRef.current === selectionRun) {
            selectionInFlightRef.current = null;
          }
        });
    }

    if (!additiveSelection) {
      setSelectionBoxes([box]);
      setSelectedElement({ x, y, w, h });
      setSelectedIndex(box.index);
      setSelectedPoint({ page: pageIndex, x: centerX, y: centerY });
      return;
    }

    if (alreadySelected && box.index !== null) {
      const next = selectionBoxes.filter((existing) => existing.index !== box.index);
      setSelectionBoxes(next);

      if (selectedIndex === box.index) {
        const nextPrimary = next.at(-1) ?? null;
        if (!nextPrimary) {
          setSelectedElement(null);
          setSelectedPoint(null);
          setSelectedIndex(null);
        } else {
          setSelectedElement({
            x: nextPrimary.x,
            y: nextPrimary.y,
            w: nextPrimary.w,
            h: nextPrimary.h,
          });
          setSelectedPoint({
            page: nextPrimary.page,
            x: nextPrimary.centerX,
            y: nextPrimary.centerY,
          });
          setSelectedIndex(nextPrimary.index);
        }
      }
      return;
    }

    // Additive selection: add clicked element as the new primary.
    setSelectionBoxes([...selectionBoxes, box]);
    setSelectedElement({ x, y, w, h });
    setSelectedIndex(box.index);
    setSelectedPoint({ page: pageIndex, x: centerX, y: centerY });
  } else {
    setSelectedElement(null);
    setSelectionBoxes([]);
    setSelectedPoint(null);
    setSelectedIndex(null);
    setSelectedElementClasses('');
    setSelectedLayoutBreakSubtype(null);
  }
}
