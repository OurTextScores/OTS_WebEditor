// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorCore } from '../../components/score-editor/core';
import {
  useCanvasGestures,
  type CanvasGesturesContext,
} from '../../components/score-editor/canvas/useCanvasGestures';

type Late = {
  updateNoteInputShadow: ReturnType<typeof vi.fn>;
  refreshScoreSpatium: ReturnType<typeof vi.fn>;
  clearEditorSelection: ReturnType<typeof vi.fn>;
};

function setup(
  over: {
    core?: Partial<Record<keyof EditorCore, unknown>>;
    ctx?: Partial<Record<keyof CanvasGesturesContext, unknown>>;
    score?: Record<string, unknown> | null;
  } = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const score =
    over.score === undefined
      ? {
          selectElementAtPoint: vi.fn(async () => true),
          selectMeasureAtPoint: vi.fn(async () => false),
          beginGripEdit: vi.fn(async () => null),
        }
      : over.score;
  const core = {
    containerRef: { current: container },
    score,
    scoreRef: { current: score },
    zoom: 1,
    resolvePageIndex: vi.fn(() => 0),
    clientToEngravingPoint: vi.fn((x: number, y: number) => ({ x, y })),
    setSelectedElement: vi.fn(),
    setSelectionBoxes: vi.fn(),
    setSelectedPoint: vi.fn(),
    setSelectedIndex: vi.fn(),
    setSelectedElementClasses: vi.fn(),
    setSelectedLayoutBreakSubtype: vi.fn(),
    currentPageRef: { current: 0 },
    setScoreDirtySinceCheckpoint: vi.fn(),
    setScoreDirtySinceXml: vi.fn(),
    selectionOverlayGenerationRef: { current: 0 },
    selectedPoint: null,
    refreshSelectionOverlay: vi.fn(),
    blockOverlayRefreshRef: { current: false },
    setOverlaySuppressed: vi.fn(),
    scoreSvgForTarget: vi.fn(),
    noteInputActiveRef: { current: false },
    selectionBoxes: [],
    selectedIndex: null,
    currentPage: 0,
    performMutation: vi.fn(),
    requireMutation: vi.fn(),
    ...over.core,
  } as unknown as EditorCore;
  const late: { current: Late } = {
    current: {
      updateNoteInputShadow: vi.fn(),
      refreshScoreSpatium: vi.fn(async () => undefined),
      clearEditorSelection: vi.fn(),
    },
  };
  const ctx = {
    core,
    clientToScorePoint: vi.fn((x: number, y: number) => ({ x, y })),
    ignoreNextClickRef: { current: false },
    refreshPageCount: vi.fn(async () => 1),
    renderScore: vi.fn(async () => true),
    scheduleSelectionOverlayRefresh: vi.fn(),
    playSelectionPreview: vi.fn(async () => undefined),
    scoreSpatiumRef: { current: 1 },
    engravingToOverlayPoint: vi.fn(),
    refreshSelectionFromSvg: vi.fn(async () => undefined),
    interactionReady: true,
    interactiveMutationEnabled: true,
    handlePutNoteAtPoint: vi.fn(async () => undefined),
    setHasBackendHighlighting: vi.fn(),
    selectionInFlightRef: { current: false },
    gestureLateInputs: late,
    ...over.ctx,
  } as unknown as CanvasGesturesContext & {
    ignoreNextClickRef: { current: boolean };
    refreshSelectionFromSvg: ReturnType<typeof vi.fn>;
    handlePutNoteAtPoint: ReturnType<typeof vi.fn>;
    clientToScorePoint: ReturnType<typeof vi.fn>;
  };
  const hook = renderHook(() => useCanvasGestures(ctx));
  return { ctx, core, late, container, ...hook };
}

const pointer = (over: Record<string, unknown> = {}) => {
  const target = document.createElement('div');
  const capture = { set: vi.fn(), release: vi.fn() };
  return {
    event: {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      timeStamp: 0,
      target,
      currentTarget: { setPointerCapture: capture.set, releasePointerCapture: capture.release },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...over,
    } as unknown as React.PointerEvent & { preventDefault: ReturnType<typeof vi.fn> },
    capture,
  };
};

beforeEach(() => vi.clearAllMocks());

describe('marquee selection with the pointer', () => {
  it('ignores a press when the editor is not ready, with another button, or with no score', () => {
    const notReady = setup({ ctx: { interactionReady: false } });
    act(() => notReady.result.current.handleScorePointerDown(pointer().event));
    expect(notReady.result.current.dragPointerIdRef.current).toBeNull();

    const right = setup();
    act(() => right.result.current.handleScorePointerDown(pointer({ button: 2 }).event));
    expect(right.result.current.dragPointerIdRef.current).toBeNull();

    const noScore = setup({ score: null });
    act(() => noScore.result.current.handleScorePointerDown(pointer().event));
    expect(noScore.result.current.dragPointerIdRef.current).toBeNull();
  });

  it('takes the pointer on a press and ignores a second pointer until it is released', () => {
    const { result } = setup();
    act(() => result.current.handleScorePointerDown(pointer({ pointerId: 7 }).event));
    expect(result.current.dragPointerIdRef.current).toBe(7);
    act(() => result.current.handleScorePointerDown(pointer({ pointerId: 8 }).event));
    expect(result.current.dragPointerIdRef.current).toBe(7);
  });

  it('draws no rectangle until the pointer moves 4 px, then draws it from the press point', () => {
    const { result } = setup();
    act(() => result.current.handleScorePointerDown(pointer({ clientX: 100, clientY: 50 }).event));
    act(() => result.current.handleScorePointerMove(pointer({ clientX: 102, clientY: 52 }).event));
    expect(result.current.dragSelectionRect).toBeNull();

    const moved = pointer({ clientX: 90, clientY: 80 });
    act(() => result.current.handleScorePointerMove(moved.event));
    expect(result.current.dragSelectionRect).toEqual({ x: 90, y: 50, w: 10, h: 30 });
    expect(moved.capture.set).toHaveBeenCalledWith(1);
    expect(moved.event.preventDefault).toHaveBeenCalled();
  });

  it('a drag that ends selects the area, swallows the click that follows, and refreshes from the SVG', async () => {
    const { result, ctx } = setup();
    act(() => result.current.handleScorePointerDown(pointer({ clientX: 10, clientY: 10 }).event));
    act(() => result.current.handleScorePointerMove(pointer({ clientX: 60, clientY: 40 }).event));
    await act(async () =>
      result.current.handleScorePointerUp(pointer({ clientX: 60, clientY: 40 }).event),
    );
    expect(ctx.ignoreNextClickRef.current).toBe(true);
    expect(ctx.refreshSelectionFromSvg).toHaveBeenCalledTimes(1);
    expect(result.current.dragSelectionRect).toBeNull();
    expect(result.current.dragPointerIdRef.current).toBeNull();
  });

  it('a press and release without a drag is a click, not a selection drag', async () => {
    const { result, ctx } = setup();
    act(() => result.current.handleScorePointerDown(pointer().event));
    await act(async () => result.current.handleScorePointerUp(pointer().event));
    expect(ctx.ignoreNextClickRef.current).toBe(false);
    expect(ctx.refreshSelectionFromSvg).not.toHaveBeenCalled();
    expect(result.current.dragPointerIdRef.current).toBeNull();
  });

  it('cancelling a gesture clears the rectangle and frees the pointer', () => {
    const { result } = setup();
    act(() => result.current.handleScorePointerDown(pointer().event));
    act(() => result.current.handleScorePointerMove(pointer({ clientX: 80, clientY: 80 }).event));
    expect(result.current.dragSelectionRect).not.toBeNull();
    act(() => result.current.handleScorePointerCancel(pointer().event));
    expect(result.current.dragSelectionRect).toBeNull();
    expect(result.current.dragPointerIdRef.current).toBeNull();
  });

  it('with the modifier held, a press never starts a note drag', () => {
    const { result } = setup();
    const note = document.createElement('div');
    note.setAttribute('class', 'Note');
    act(() =>
      result.current.handleScorePointerDown(pointer({ ctrlKey: true, target: note }).event),
    );
    expect(result.current.dragPointerIdRef.current).toBe(1);
    // an additive press is a lasso, so a move of 4 px draws the rectangle
    act(() => result.current.handleScorePointerMove(pointer({ clientX: 40, clientY: 40 }).event));
    expect(result.current.dragSelectionRect).not.toBeNull();
  });
});

describe('mouse fallback', () => {
  const mouse = (over: Record<string, unknown> = {}) =>
    pointer(over).event as unknown as React.MouseEvent;

  it('starts a gesture on mouse down only when no pointer gesture is running', () => {
    const { result } = setup();
    act(() => result.current.handleScoreMouseDown(mouse()));
    expect(result.current.dragPointerIdRef.current).toBe(-1);
    const second = setup();
    act(() => second.result.current.handleScorePointerDown(pointer({ pointerId: 3 }).event));
    act(() => second.result.current.handleScoreMouseDown(mouse()));
    expect(second.result.current.dragPointerIdRef.current).toBe(3);
  });

  it('feeds the note-input shadow instead of dragging while notes are being entered', () => {
    const { result, core, late } = setup();
    (core.noteInputActiveRef as { current: boolean }).current = true;
    act(() => result.current.handleScoreMouseMove(mouse({ clientX: 5, clientY: 6 })));
    expect(late.current.updateNoteInputShadow).toHaveBeenCalledWith(5, 6, expect.anything());
  });
});

describe('click', () => {
  const click = (over: Record<string, unknown> = {}) =>
    pointer(over).event as unknown as React.MouseEvent;

  it('does nothing before the editor is ready or without a score', async () => {
    const notReady = setup({ ctx: { interactionReady: false } });
    await act(async () => notReady.result.current.handleScoreClick(click()));
    expect(notReady.core.selectionOverlayGenerationRef.current).toBe(0);

    const noScore = setup({ score: null });
    await act(async () => noScore.result.current.handleScoreClick(click()));
    expect(noScore.core.selectionOverlayGenerationRef.current).toBe(0);
  });

  it('swallows exactly one click after a drag', async () => {
    const { result, ctx, core } = setup();
    ctx.ignoreNextClickRef.current = true;
    await act(async () => result.current.handleScoreClick(click()));
    expect(ctx.ignoreNextClickRef.current).toBe(false);
    expect(core.selectionOverlayGenerationRef.current).toBe(0);
    await act(async () => result.current.handleScoreClick(click()));
    expect(core.selectionOverlayGenerationRef.current).toBe(1);
  });

  it('invalidates a pending overlay refresh before it selects anything', async () => {
    const { result, core } = setup();
    await act(async () => result.current.handleScoreClick(click()));
    expect(core.selectionOverlayGenerationRef.current).toBe(1);
  });

  it('puts a note at the point while notes are being entered, instead of selecting', async () => {
    const { result, ctx, core } = setup();
    (core.noteInputActiveRef as { current: boolean }).current = true;
    (core.resolvePageIndex as ReturnType<typeof vi.fn>).mockReturnValue(2);
    await act(async () => result.current.handleScoreClick(click({ clientX: 30, clientY: 40 })));
    expect(ctx.handlePutNoteAtPoint).toHaveBeenCalledWith(2, 30, 40);
    expect(
      (core.score as { selectElementAtPoint: ReturnType<typeof vi.fn> }).selectElementAtPoint,
    ).not.toHaveBeenCalled();
  });

  it('clears the selection when the point cannot be mapped onto the score', async () => {
    const { result, late } = setup({ ctx: { clientToScorePoint: vi.fn(() => null) } });
    await act(async () => result.current.handleScoreClick(click()));
    expect(late.current.clearEditorSelection).toHaveBeenCalled();
  });

  it('asks the engine to select the point when the click lands on empty space', async () => {
    const { result, core } = setup();
    (core.resolvePageIndex as ReturnType<typeof vi.fn>).mockReturnValue(1);
    await act(async () => result.current.handleScoreClick(click({ clientX: 12, clientY: 34 })));
    expect(
      (core.score as { selectElementAtPoint: ReturnType<typeof vi.fn> }).selectElementAtPoint,
    ).toHaveBeenCalledWith(1, 12, 34);
  });
});

describe('grip editing', () => {
  it('starts a grip edit from a quick second press on a spanner', async () => {
    const { result, core } = setup();
    const spanner = document.createElement('div');
    spanner.setAttribute('class', 'SlurSegment');
    // the closest() lookup runs on the target itself
    act(() =>
      result.current.handleScorePointerDown(
        pointer({ target: spanner, clientX: 50, clientY: 50, timeStamp: 100 }).event,
      ),
    );
    act(() => result.current.handleScorePointerCancel(pointer({ pointerId: 1 }).event));
    const second = pointer({
      target: spanner,
      clientX: 52,
      clientY: 51,
      timeStamp: 300,
      pointerId: 2,
    });
    await act(async () => result.current.handleScorePointerDown(second.event));
    expect(second.event.preventDefault).toHaveBeenCalled();
    expect(
      (core.score as { beginGripEdit: ReturnType<typeof vi.fn> }).beginGripEdit,
    ).toHaveBeenCalledWith(0, 52, 51);
  });

  it('does not treat a slow second press, or one far away, as a double press', async () => {
    const { result, core } = setup();
    const spanner = document.createElement('div');
    spanner.setAttribute('class', 'SlurSegment');
    act(() =>
      result.current.handleScorePointerDown(
        pointer({ target: spanner, clientX: 50, clientY: 50, timeStamp: 100 }).event,
      ),
    );
    act(() => result.current.handleScorePointerCancel(pointer({ pointerId: 1 }).event));
    await act(async () =>
      result.current.handleScorePointerDown(
        pointer({ target: spanner, clientX: 50, clientY: 50, timeStamp: 900, pointerId: 2 }).event,
      ),
    );
    expect(
      (core.score as { beginGripEdit: ReturnType<typeof vi.fn> }).beginGripEdit,
    ).not.toHaveBeenCalled();
  });
});
