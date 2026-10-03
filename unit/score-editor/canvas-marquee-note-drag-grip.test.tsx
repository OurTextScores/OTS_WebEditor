// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performDragSelection } from '../../components/score-editor/canvas/marquee-selection';
import {
  useCanvasGestures,
  type CanvasGesturesContext,
} from '../../components/score-editor/canvas/useCanvasGestures';
import {
  useGripEdit,
  type GripEditContext,
} from '../../components/score-editor/canvas/useGripEdit';
import type { EditorCore } from '../../components/score-editor/core';
import {
  closeTopEscapeLayer,
  resetEscapeLayersForTests,
} from '../../components/shell/keyboard/escapeLayers';

type Box = { left: number; top: number; width: number; height: number };
const place = (el: Element, box: Box) => {
  el.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON() {},
    }) as DOMRect;
};
const mount = (className: string, box: Box, parent: HTMLElement) => {
  const el = document.createElement('div');
  el.setAttribute('class', className);
  place(el, box);
  parent.appendChild(el);
  return el;
};
const asCore = (core: Record<string, unknown>) => core as unknown as EditorCore;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  resetEscapeLayersForTests();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('performDragSelection: the marquee', () => {
  function setupMarquee(score: Record<string, unknown> | null = {}) {
    const container = document.createElement('div');
    place(container, { left: 100, top: 100, width: 1000, height: 1000 });
    document.body.appendChild(container);
    const core = {
      containerRef: { current: container },
      score,
      zoom: 2,
      resolvePageIndex: vi.fn(() => 0),
      clientToEngravingPoint: vi.fn(() => null),
      selectedIndex: null,
      selectionBoxes: [],
      setSelectedElement: vi.fn(),
      setSelectedElementClasses: vi.fn(),
      setSelectedIndex: vi.fn(),
      setSelectedLayoutBreakSubtype: vi.fn(),
      setSelectedPoint: vi.fn(),
      setSelectionBoxes: vi.fn(),
    };
    return {
      container,
      core,
      run: (rect: { x: number; y: number; w: number; h: number }, additive = false) =>
        performDragSelection(asCore(core), rect, additive),
    };
  }

  it('does nothing without a container or a score', async () => {
    expect(await setupMarquee(null).run({ x: 0, y: 0, w: 9, h: 9 })).toBeNull();
  });

  it('selects the elements the rectangle touches, in score units (zoom removed), first in reading order', async () => {
    const m = setupMarquee({ selectElementAtPoint: vi.fn(), clearSelection: vi.fn() });
    mount('Note', { left: 140, top: 140, width: 20, height: 20 }, m.container); // x=20,y=20,w=10,h=10
    mount('Rest', { left: 300, top: 140, width: 20, height: 20 }, m.container); // x=100
    mount('Note', { left: 900, top: 900, width: 20, height: 20 }, m.container); // far away
    const fallback = await m.run({ x: 0, y: 0, w: 200, h: 100 });
    expect(m.core.setSelectionBoxes).toHaveBeenCalledWith([
      expect.objectContaining({ x: 20, y: 20, w: 10, h: 10, classes: 'Note', page: 0 }),
      expect.objectContaining({ x: 100, y: 20, classes: 'Rest' }),
    ]);
    expect(m.core.setSelectedElement).toHaveBeenCalledWith(
      expect.objectContaining({ x: 20, y: 20 }),
    );
    expect(m.core.setSelectedPoint).toHaveBeenCalledWith({ page: 0, x: 25, y: 25 });
    expect(fallback).toEqual({ index: 0, point: { page: 0, x: 25, y: 25 } });
    const score = m.core.score as {
      clearSelection: ReturnType<typeof vi.fn>;
      selectElementAtPoint: ReturnType<typeof vi.fn>;
    };
    expect(score.clearSelection).toHaveBeenCalled();
    expect(score.selectElementAtPoint).toHaveBeenCalledWith(0, 25, 25);
  });

  it('counts an element that only touches the edge, and skips ones with no size', async () => {
    const m = setupMarquee({ selectElementAtPoint: vi.fn(), clearSelection: vi.fn() });
    mount('Note', { left: 100 + 2 * 50, top: 100, width: 20, height: 20 }, m.container); // x=50: touches a rect ending at 50
    mount('Note', { left: 100, top: 100, width: 0, height: 0 }, m.container);
    await m.run({ x: 0, y: 0, w: 50, h: 50 });
    expect(m.core.setSelectionBoxes).toHaveBeenCalledWith([expect.objectContaining({ x: 50 })]);
  });

  it('clears the selection when nothing is hit, unless adding', async () => {
    const m = setupMarquee({ clearSelection: vi.fn(async () => undefined) });
    expect(await m.run({ x: 0, y: 0, w: 5, h: 5 })).toBeNull();
    expect(m.core.setSelectionBoxes).toHaveBeenCalledWith([]);
    expect(m.core.setSelectedElement).toHaveBeenCalledWith(null);
    expect(
      (m.core.score as { clearSelection: ReturnType<typeof vi.fn> }).clearSelection,
    ).toHaveBeenCalled();

    const add = setupMarquee({ clearSelection: vi.fn() });
    await add.run({ x: 0, y: 0, w: 5, h: 5 }, true);
    expect(add.core.setSelectionBoxes).not.toHaveBeenCalled();
  });

  it('adds to the selection without duplicating, when additive', async () => {
    const m = setupMarquee({ selectElementAtPoint: vi.fn() });
    mount('Note', { left: 140, top: 140, width: 20, height: 20 }, m.container);
    await m.run({ x: 0, y: 0, w: 200, h: 100 }, true);
    const update = m.core.setSelectionBoxes.mock.calls[0][0] as (
      prev: unknown[],
    ) => Array<{ index: number }>;
    const existing = {
      index: 0,
      page: 0,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      centerX: 0,
      centerY: 0,
      classes: 'Note',
    };
    expect(update([existing])).toHaveLength(1);
    expect(update([{ ...existing, index: 7 }]).map((box) => box.index)).toEqual([7, 0]);
    const score = m.core.score as { clearSelection?: unknown };
    expect(score.clearSelection).toBeUndefined();
  });

  it('selects a range from the leftmost to the rightmost note when several notes are hit', async () => {
    const select = vi.fn<(...args: number[]) => Promise<boolean>>(async () => true);
    const m = setupMarquee({ selectElementAtPointWithMode: select });
    mount('Note', { left: 300, top: 140, width: 20, height: 20 }, m.container); // x=100
    mount('Note', { left: 140, top: 140, width: 20, height: 20 }, m.container); // x=20
    await m.run({ x: 0, y: 0, w: 300, h: 100 });
    expect(select.mock.calls).toEqual([
      [0, 25, 25, 0],
      [0, 105, 25, 3],
    ]);
    select.mockClear();
    await m.run({ x: 0, y: 0, w: 300, h: 100 }, true);
    expect(select.mock.calls[0][3]).toBe(1);
  });

  it('adds each non-note element to the selection', async () => {
    const select = vi.fn<(...args: number[]) => Promise<boolean>>(async () => true);
    const m = setupMarquee({ selectElementAtPointWithMode: select });
    mount('Rest', { left: 140, top: 140, width: 20, height: 20 }, m.container);
    mount('Rest', { left: 300, top: 140, width: 20, height: 20 }, m.container);
    await m.run({ x: 0, y: 0, w: 300, h: 100 });
    expect(select.mock.calls.map((call) => call[3])).toEqual([0, 1]);
  });
});

describe('note drag through the canvas gestures', () => {
  function setupDrag(over: { ctrl?: boolean } = {}) {
    const container = document.createElement('div');
    place(container, { left: 0, top: 0, width: 1000, height: 1000 });
    document.body.appendChild(container);
    const note = mount('Note', { left: 100, top: 100, width: 10, height: 8 }, container);
    const score = {
      beginElementDrag: vi.fn(async () => true),
      updateElementDrag: vi.fn(async () => true),
      endElementDrag: vi.fn(async () => true),
      relayout: vi.fn(async () => undefined),
      selectElementAtPoint: vi.fn(),
    };
    const core = {
      containerRef: { current: container },
      score,
      scoreRef: { current: score },
      zoom: 1,
      resolvePageIndex: vi.fn(() => 2),
      clientToEngravingPoint: vi.fn((x: number, y: number) => ({ x, y })),
      currentPageRef: { current: 2 },
      noteInputActiveRef: { current: false },
      selectionOverlayGenerationRef: { current: 0 },
      setScoreDirtySinceCheckpoint: vi.fn(),
      setScoreDirtySinceXml: vi.fn(),
      setSelectedElement: vi.fn(),
      setSelectionBoxes: vi.fn(),
      setSelectedPoint: vi.fn(),
      setSelectedIndex: vi.fn(),
      setSelectedElementClasses: vi.fn(),
      setSelectedLayoutBreakSubtype: vi.fn(),
      selectionBoxes: [],
      selectedIndex: null,
    };
    const ctx = {
      core: asCore(core),
      clientToScorePoint: vi.fn((x: number, y: number) => ({ x, y })),
      ignoreNextClickRef: { current: false },
      refreshPageCount: vi.fn(async () => 2),
      renderScore: vi.fn(async () => true),
      scheduleSelectionOverlayRefresh: vi.fn(),
      playSelectionPreview: vi.fn(async () => undefined),
      scoreSpatiumRef: { current: 10 }, // a half step is 5 score units
      engravingToOverlayPoint: vi.fn(),
      refreshSelectionFromSvg: vi.fn(async () => undefined),
      interactionReady: true,
      interactiveMutationEnabled: true,
      handlePutNoteAtPoint: vi.fn(),
      setHasBackendHighlighting: vi.fn(),
      selectionInFlightRef: { current: null },
      gestureLateInputs: {
        current: {
          updateNoteInputShadow: vi.fn(),
          refreshScoreSpatium: vi.fn(async () => undefined),
          clearEditorSelection: vi.fn(),
        },
      },
    };
    const hook = renderHook(() => useCanvasGestures(ctx as unknown as CanvasGesturesContext));
    const press = () =>
      act(() =>
        hook.result.current.handleScorePointerDown({
          button: 0,
          pointerId: 4,
          clientX: 105,
          clientY: 104,
          metaKey: false,
          ctrlKey: over.ctrl ?? false,
          shiftKey: false,
          timeStamp: 0,
          target: note,
          preventDefault() {},
          stopPropagation() {},
        } as unknown as React.PointerEvent),
      );
    const windowPointer = async (
      type: string,
      clientX: number,
      clientY: number,
      extra: Record<string, unknown> = {},
    ) => {
      const event = new MouseEvent(type, {
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
        ...extra,
      });
      Object.assign(event, { pointerId: (extra.pointerId as number) ?? 4 });
      await act(async () => {
        window.dispatchEvent(event);
        await Promise.resolve();
      });
    };
    return { ...hook, core, ctx, score, press, windowPointer };
  }

  it('a press on a note that never moves far enough is an ordinary click', async () => {
    const d = setupDrag();
    await d.press();
    await d.windowPointer('pointermove', 107, 106);
    expect(d.result.current.noteDragGhost).toBeNull();
    await d.windowPointer('pointerup', 107, 106);
    expect(d.score.updateElementDrag).not.toHaveBeenCalled();
    expect(d.score.endElementDrag).not.toHaveBeenCalled();
    expect(d.ctx.ignoreNextClickRef.current).toBe(false);
  });

  it('dragging past the threshold shows a ghost, in whole half steps, and follows the pointer in the engine', async () => {
    const d = setupDrag();
    await d.press();
    await d.windowPointer('pointermove', 105, 94, { shiftKey: true }); // 10 up = 2 half steps up from y=104
    expect(d.result.current.noteDragGhost).toEqual({ x: 100, y: 90, w: 10, h: 8, steps: -2 });
    expect(d.score.beginElementDrag).toHaveBeenCalledWith(2, 105, 104);
    expect(d.score.updateElementDrag).toHaveBeenCalledWith(2, 105, 94, 1, 2);
    expect(d.ctx.renderScore).toHaveBeenCalledWith(d.score, 2, true, expect.anything());
  });

  it('releasing commits the drag, swallows the click, and refreshes the score and selection', async () => {
    const d = setupDrag();
    await d.press();
    await d.windowPointer('pointermove', 105, 94);
    await d.windowPointer('pointerup', 105, 94);
    await act(async () => {
      await Promise.resolve();
    });
    expect(d.result.current.noteDragGhost).toBeNull();
    expect(d.ctx.ignoreNextClickRef.current).toBe(true);
    expect(d.score.endElementDrag).toHaveBeenCalledWith(true);
    expect(d.score.relayout).toHaveBeenCalled();
    expect(d.core.setScoreDirtySinceXml).toHaveBeenCalledWith(true);
    expect(d.core.setScoreDirtySinceCheckpoint).toHaveBeenCalledWith(true);
    expect(d.ctx.scheduleSelectionOverlayRefresh).toHaveBeenCalledWith(
      null,
      { page: 2, x: 105, y: 94 },
      1,
    );
    expect(d.ctx.playSelectionPreview).toHaveBeenCalledWith('mutation:drag note pitch', undefined, {
      reselect: false,
    });
  });

  it('dropping back where it started changes nothing but still swallows the click', async () => {
    const d = setupDrag();
    await d.press();
    await d.windowPointer('pointermove', 105, 94);
    await d.windowPointer('pointerup', 105, 104);
    await act(async () => {
      await Promise.resolve();
    });
    expect(d.score.endElementDrag).toHaveBeenCalledWith(false);
    expect(d.ctx.ignoreNextClickRef.current).toBe(true);
    expect(d.core.setScoreDirtySinceXml).not.toHaveBeenCalled();
  });

  it('a cancelled pointer abandons the drag without swallowing the next click', async () => {
    const d = setupDrag();
    await d.press();
    await d.windowPointer('pointermove', 105, 94);
    await d.windowPointer('pointercancel', 105, 94);
    await act(async () => {
      await Promise.resolve();
    });
    expect(d.score.endElementDrag).toHaveBeenCalledWith(false);
    expect(d.ctx.ignoreNextClickRef.current).toBe(false);
    expect(d.result.current.noteDragGhost).toBeNull();
  });

  it('Escape abandons the drag and swallows the click the release would otherwise cause', async () => {
    const d = setupDrag();
    await d.press();
    await d.windowPointer('pointermove', 105, 94);
    await act(async () => {
      closeTopEscapeLayer();
      await Promise.resolve();
    });
    expect(d.score.endElementDrag).toHaveBeenCalledWith(false);
    expect(d.ctx.ignoreNextClickRef.current).toBe(true);
    expect(d.result.current.noteDragGhost).toBeNull();
  });

  it('unmounting in the middle of a drag ends the engine drag without committing', async () => {
    const d = setupDrag();
    await d.press();
    await d.windowPointer('pointermove', 105, 94);
    const removed = vi.spyOn(window, 'removeEventListener');
    d.unmount();
    expect(d.score.endElementDrag).toHaveBeenCalledWith(false);
    expect(removed.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel']),
    );
  });

  it('ignores another pointer, and a lasso modifier turns the press into a marquee', async () => {
    const d = setupDrag();
    await d.press();
    await d.windowPointer('pointermove', 105, 94, { pointerId: 99 });
    expect(d.result.current.noteDragGhost).toBeNull();

    const lasso = setupDrag({ ctrl: true });
    await lasso.press();
    await lasso.windowPointer('pointermove', 105, 94);
    expect(lasso.result.current.noteDragGhost).toBeNull();
    expect(lasso.score.beginElementDrag).not.toHaveBeenCalled();
  });

  it('does not start a note drag when the editor cannot mutate or the engine cannot drag', async () => {
    const d = setupDrag();
    delete (d.score as Partial<typeof d.score>).beginElementDrag;
    d.ctx.interactiveMutationEnabled = false;
    d.rerender();
    await d.press();
    await d.windowPointer('pointermove', 105, 94);
    expect(d.result.current.noteDragGhost).toBeNull();
  });
});

describe('useGripEdit', () => {
  function setupGrip(score: Record<string, unknown> | null) {
    const ctx = {
      core: asCore({
        clientToEngravingPoint: vi.fn((x: number, y: number) => ({ x, y })),
        currentPageRef: { current: 0 },
        noteInputActiveRef: { current: false },
        score,
        setScoreDirtySinceCheckpoint: vi.fn(),
        setScoreDirtySinceXml: vi.fn(),
        zoom: 1,
      }),
      refreshPageCount: vi.fn(async () => 1),
      renderScore: vi.fn(async () => true),
      engravingToOverlayPoint: vi.fn((x: number, y: number) => ({ x, y })),
      refreshSelectionFromSvg: vi.fn(async () => undefined),
      interactiveMutationEnabled: true,
    };
    return { ctx, ...renderHook(() => useGripEdit(ctx as unknown as GripEditContext)) };
  }
  const info = {
    page: 0,
    grips: [
      { index: 0, x: 10, y: 20, draggable: true },
      { index: 1, x: 30, y: 20, draggable: false },
    ],
  };
  const down = (over: Record<string, unknown> = {}) =>
    ({
      button: 0,
      pointerId: 3,
      clientX: 10,
      clientY: 20,
      preventDefault() {},
      stopPropagation() {},
      ...over,
    }) as unknown as React.PointerEvent;
  const windowPointer = (
    type: string,
    clientX: number,
    clientY: number,
    extra: Record<string, unknown> = {},
  ) => {
    const event = new MouseEvent(type, { clientX, clientY, ...extra });
    Object.assign(event, { pointerId: 3 });
    return act(async () => {
      window.dispatchEvent(event);
      await Promise.resolve();
    });
  };
  const withGrips = () => ({
    beginGripEdit: vi.fn(async () => info),
    dragGrip: vi.fn(async () => true),
    endGripEdit: vi.fn(async () => true),
    relayout: vi.fn(async () => undefined),
  });

  it('begins a grip edit at a point only when mutation is allowed and the engine supports it', async () => {
    const score = withGrips();
    const g = setupGrip(score);
    await act(async () => g.result.current.beginGripEditAtPoint(1, 5, 6));
    expect(score.beginGripEdit).toHaveBeenCalledWith(1, 5, 6);
    expect(g.result.current.gripEdit).toEqual(info);

    const none = setupGrip({
      ...withGrips(),
      beginGripEdit: vi.fn(async () => ({ page: 0, grips: [] })),
    });
    await act(async () => none.result.current.beginGripEditAtPoint(0, 1, 1));
    expect(none.result.current.gripEdit).toBeNull();

    const bare = setupGrip({});
    await act(async () => bare.result.current.beginGripEditAtPoint(0, 1, 1));
    expect(bare.result.current.gripEdit).toBeNull();
  });

  it('dragging a grip moves it live and commits the distance on release', async () => {
    const score = withGrips();
    const g = setupGrip(score);
    await act(async () => g.result.current.beginGripEditAtPoint(0, 10, 20));
    act(() => g.result.current.handleGripPointerDown(down(), 0));
    await windowPointer('pointermove', 15, 28);
    expect(g.result.current.gripEdit?.grips[0]).toMatchObject({ x: 15, y: 28 });
    await windowPointer('pointerup', 15, 28, { altKey: true, shiftKey: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(score.dragGrip).toHaveBeenCalledWith(0, 5, 8, 5);
    expect(score.endGripEdit).toHaveBeenCalledWith(true);
    expect(score.relayout).toHaveBeenCalled();
    expect(g.result.current.gripEdit).toBeNull();
    expect(g.ctx.core.setScoreDirtySinceXml).toHaveBeenCalledWith(true);
    expect(g.ctx.refreshSelectionFromSvg).toHaveBeenCalledWith({
      index: null,
      point: { page: 0, x: 15, y: 28 },
    });
  });

  it('passes Ctrl as the second modifier bit', async () => {
    const score = withGrips();
    const g = setupGrip(score);
    await act(async () => g.result.current.beginGripEditAtPoint(0, 10, 20));
    act(() => g.result.current.handleGripPointerDown(down(), 0));
    await windowPointer('pointerup', 12, 20, { ctrlKey: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(score.dragGrip).toHaveBeenCalledWith(0, 2, 0, 2);
  });

  it('a release without movement commits nothing', async () => {
    const score = withGrips();
    const g = setupGrip(score);
    await act(async () => g.result.current.beginGripEditAtPoint(0, 10, 20));
    act(() => g.result.current.handleGripPointerDown(down(), 0));
    await windowPointer('pointerup', 10, 20);
    await act(async () => {
      await Promise.resolve();
    });
    expect(score.dragGrip).not.toHaveBeenCalled();
    expect(score.endGripEdit).toHaveBeenCalledWith(false);
    expect(g.ctx.core.setScoreDirtySinceXml).not.toHaveBeenCalled();
  });

  it('ignores the wrong button, a grip that cannot be dragged, and an unknown grip', async () => {
    const score = withGrips();
    const g = setupGrip(score);
    await act(async () => g.result.current.beginGripEditAtPoint(0, 10, 20));
    for (const [event, index] of [
      [down({ button: 2 }), 0],
      [down(), 1],
      [down(), 9],
    ] as const) {
      act(() => g.result.current.handleGripPointerDown(event, index));
      await windowPointer('pointermove', 50, 50);
      expect(g.result.current.gripEdit).toEqual(info);
    }
  });

  it('Escape cancels a grip drag, and closeGripEdit ends the edit with the choice given', async () => {
    const score = withGrips();
    const g = setupGrip(score);
    await act(async () => g.result.current.beginGripEditAtPoint(0, 10, 20));
    act(() => g.result.current.handleGripPointerDown(down(), 0));
    await act(async () => {
      closeTopEscapeLayer();
      await Promise.resolve();
    });
    expect(g.result.current.gripEdit).toBeNull();
    expect(score.endGripEdit).toHaveBeenCalledWith(false);

    await act(async () => g.result.current.beginGripEditAtPoint(0, 10, 20));
    act(() => g.result.current.closeGripEdit(true));
    expect(score.endGripEdit).toHaveBeenLastCalledWith(true);
    expect(g.result.current.gripEdit).toBeNull();
  });

  it('unmounting ends an edit that is still open', async () => {
    const score = withGrips();
    const g = setupGrip(score);
    g.unmount();
    expect(score.endGripEdit).toHaveBeenCalledWith(false);
  });
});
