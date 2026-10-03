// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangeReviewBarOverlay } from '../../components/score-editor/canvas/ChangeReviewBarOverlay';
import { DragFeedbackOverlays } from '../../components/score-editor/canvas/DragFeedbackOverlays';
import { GripHandles } from '../../components/score-editor/canvas/GripHandles';
import { InlineTextEditor } from '../../components/score-editor/canvas/InlineTextEditor';
import { NoteInputOverlays } from '../../components/score-editor/canvas/NoteInputOverlays';
import { ScoreCanvas } from '../../components/score-editor/canvas/ScoreCanvas';
import { SelectionOverlays } from '../../components/score-editor/canvas/SelectionOverlays';

afterEach(cleanup);

const rect = { x: 1, y: 2, w: 30, h: 40 };

describe('ChangeReviewBarOverlay', () => {
  const bar = (anchorId: string, extra: Record<string, unknown> = {}) => ({
    bar: { anchorId, label: `Bar ${anchorId}`, ...extra },
    left: 10,
    top: 20,
    width: 30,
    height: 40,
  });
  const setup = (over: Record<string, unknown> = {}) => {
    const props = {
      boxes: [
        bar('a', { changeType: 'added' }),
        bar('b', { changeType: 'modified' }),
        bar('c', { hasThread: true }),
      ],
      focusedAnchorId: null as string | null,
      anchorsWithThreads: new Set<string>(),
      canAddThread: true,
      setFocusedAnchorId: vi.fn(),
      setNewThreadAnchorId: vi.fn(),
      setNewThreadContent: vi.fn(),
      ...over,
    };
    render(<ChangeReviewBarOverlay {...props} />);
    return props;
  };

  it('draws one labelled button per bar at its position, coloured by the change', () => {
    setup();
    const a = screen.getByLabelText('Comment on Bar a');
    expect(a).toHaveStyle({ left: '10px', top: '20px', width: '30px', height: '40px' });
    expect(a.className).toContain('border-emerald-500');
    expect(screen.getByLabelText('Comment on Bar b').className).toContain('border-amber-500');
    expect(screen.getByLabelText('Comment on Bar c')).toHaveStyle({
      backgroundColor: 'rgba(16, 185, 129, 0.35)',
    });
  });

  it('treats a bar with a thread elsewhere as having a thread, and marks the focused one', () => {
    setup({ anchorsWithThreads: new Set(['a']), focusedAnchorId: 'b' });
    expect(screen.getByLabelText('Comment on Bar a')).toHaveStyle({
      borderColor: 'rgb(5, 150, 105)',
    });
    const focused = screen.getByLabelText('Comment on Bar b');
    expect(focused).toHaveAttribute('aria-pressed', 'true');
    expect(focused.className).toContain('ring-sky-500');
    expect(screen.getByLabelText('Comment on Bar a')).toHaveAttribute('aria-pressed', 'false');
  });

  it('focuses a bar on click and opens a new thread on it, without letting the click reach the score', () => {
    const props = setup();
    const outer = vi.fn();
    document.body.addEventListener('click', outer);
    fireEvent.click(screen.getByLabelText('Comment on Bar a'));
    expect(outer).not.toHaveBeenCalled();
    expect(props.setFocusedAnchorId).toHaveBeenCalledWith('a');
    expect(props.setNewThreadAnchorId).toHaveBeenCalledWith('a');
    expect(props.setNewThreadContent).toHaveBeenCalledWith('');
    document.body.removeEventListener('click', outer);
  });

  it('does not open a thread on a bar that has one, or when threads cannot be added; a second click unfocuses', () => {
    const withThread = setup();
    fireEvent.click(screen.getByLabelText('Comment on Bar c'));
    expect(withThread.setFocusedAnchorId).toHaveBeenCalledWith('c');
    expect(withThread.setNewThreadAnchorId).toHaveBeenCalledWith(null);
    cleanup();
    const readOnly = setup({ canAddThread: false });
    fireEvent.click(screen.getByLabelText('Comment on Bar a'));
    expect(readOnly.setNewThreadAnchorId).toHaveBeenCalledWith(null);
    cleanup();
    const focused = setup({ focusedAnchorId: 'a' });
    fireEvent.click(screen.getByLabelText('Comment on Bar a'));
    expect(focused.setFocusedAnchorId).toHaveBeenCalledWith(null);
    expect(focused.setNewThreadAnchorId).toHaveBeenCalledWith(null);
  });
});

describe('DragFeedbackOverlays', () => {
  it('draws nothing at rest', () => {
    const { container } = render(<DragFeedbackOverlays selectionRect={null} noteGhost={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('draws the marquee rectangle where it is', () => {
    render(<DragFeedbackOverlays selectionRect={rect} noteGhost={null} />);
    expect(screen.getByTestId('drag-selection-rect')).toHaveStyle({
      left: '1px',
      top: '2px',
      width: '30px',
      height: '40px',
    });
  });

  it('draws the note ghost, with the step count only once it has moved', () => {
    const { rerender } = render(
      <DragFeedbackOverlays selectionRect={null} noteGhost={{ ...rect, steps: 0 }} />,
    );
    expect(screen.getByTestId('note-drag-ghost')).toHaveStyle({ left: '1px', top: '2px' });
    expect(screen.queryByText(/[▲▼]/)).toBeNull();
    rerender(<DragFeedbackOverlays selectionRect={null} noteGhost={{ ...rect, steps: -3 }} />);
    expect(screen.getByText('▲ 3')).toBeInTheDocument();
    rerender(<DragFeedbackOverlays selectionRect={null} noteGhost={{ ...rect, steps: 2 }} />);
    expect(screen.getByText('▼ 2')).toBeInTheDocument();
  });
});

describe('NoteInputOverlays', () => {
  const cursor = { page: 1, x: 5, y: 6, width: 3, height: 50, voice: 2 };
  const shadow = { x: 7, y: 8, w: 9, h: 10 };

  it('draws nothing unless note input is on', () => {
    const { container } = render(
      <NoteInputOverlays
        active={false}
        currentPage={1}
        cursorRect={cursor}
        cursorColor="#112233"
        shadow={shadow}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('draws the cursor in the voice colour, only on its own page', () => {
    const { rerender } = render(
      <NoteInputOverlays
        active
        currentPage={1}
        cursorRect={cursor}
        cursorColor="#112233"
        shadow={null}
      />,
    );
    const element = screen.getByTestId('note-input-cursor');
    expect(element).toHaveAttribute('data-voice', '2');
    expect(element).toHaveAttribute('aria-hidden', 'true');
    expect(element).toHaveStyle({
      left: '5px',
      top: '6px',
      width: '3px',
      height: '50px',
      borderLeft: '3px solid #112233',
    });
    rerender(
      <NoteInputOverlays
        active
        currentPage={0}
        cursorRect={cursor}
        cursorColor="#112233"
        shadow={null}
      />,
    );
    expect(screen.queryByTestId('note-input-cursor')).toBeNull();
  });

  it('draws the shadow note under the pointer', () => {
    render(
      <NoteInputOverlays
        active
        currentPage={0}
        cursorRect={null}
        cursorColor="#000000"
        shadow={shadow}
      />,
    );
    const element = screen.getByTestId('note-input-shadow');
    expect(element).toHaveStyle({ left: '7px', top: '8px', width: '9px', height: '10px' });
    expect(element).toHaveAttribute('title', 'Click to place note');
  });
});

describe('GripHandles', () => {
  const info = {
    page: 2,
    grips: [
      { index: 0, x: 10, y: 20, draggable: true },
      { index: 1, x: 30, y: 40, draggable: false },
    ],
  };
  const setup = (over: Record<string, unknown> = {}) => {
    const props = {
      gripEdit: info,
      currentPage: 2,
      zoom: 2,
      engravingToOverlayPoint: vi.fn((x: number, y: number) => ({ x: x + 1, y: y + 2 })),
      onGripPointerDown: vi.fn(),
      ...over,
    };
    render(<GripHandles {...(props as unknown as React.ComponentProps<typeof GripHandles>)} />);
    return props;
  };

  it('draws a handle per grip at its overlay position, counter-scaled by the zoom', () => {
    const props = setup();
    expect(props.engravingToOverlayPoint).toHaveBeenCalledWith(10, 20);
    const first = screen.getByTestId('spanner-grip-0');
    expect(first).toHaveStyle({
      left: '11px',
      top: '22px',
      transform: 'translate(-50%, -50%) scale(0.5)',
    });
    expect(first).toHaveAttribute('aria-label', 'Spanner grip 1');
    expect(first).toHaveAttribute('title', 'Drag to reshape');
    expect(first).toBeEnabled();
  });

  it('disables a grip that cannot be dragged and says why', () => {
    setup();
    const second = screen.getByTestId('spanner-grip-1');
    expect(second).toBeDisabled();
    expect(second).toHaveAttribute('title', 'This anchor requires the desktop score view');
  });

  it('starts a drag on pointer-down with the grip’s index, and keeps clicks away from the score', () => {
    const props = setup();
    fireEvent.pointerDown(screen.getByTestId('spanner-grip-0'));
    expect(props.onGripPointerDown).toHaveBeenCalledWith(expect.anything(), 0);
    const outer = vi.fn();
    document.body.addEventListener('click', outer);
    fireEvent.click(screen.getByTestId('spanner-grip-0'));
    document.body.removeEventListener('click', outer);
    expect(outer).not.toHaveBeenCalled();
  });

  it('draws nothing for another page or no edit', () => {
    const other = render(
      <GripHandles
        gripEdit={info as never}
        currentPage={0}
        zoom={1}
        engravingToOverlayPoint={vi.fn()}
        onGripPointerDown={vi.fn()}
      />,
    );
    expect(other.container).toBeEmptyDOMElement();
    other.unmount();
    const none = render(
      <GripHandles
        gripEdit={null}
        currentPage={0}
        zoom={1}
        engravingToOverlayPoint={vi.fn()}
        onGripPointerDown={vi.fn()}
      />,
    );
    expect(none.container).toBeEmptyDOMElement();
  });
});

describe('SelectionOverlays', () => {
  const box = (x: number, extra: Record<string, unknown> = {}) => ({
    x,
    y: 5,
    w: 10,
    h: 12,
    ...extra,
  });
  const base = {
    secondaryBoxes: [],
    selectionBoxes: [],
    primaryRect: null,
    hasBackendHighlighting: false,
    overlaySuppressed: false,
  };

  it('draws one rectangle for a single selected element', () => {
    render(<SelectionOverlays {...base} primaryRect={box(1)} selectionBoxes={[box(1)]} />);
    expect(screen.getAllByTestId('selection-overlay')).toHaveLength(1);
    expect(screen.getByTestId('selection-overlay')).toHaveStyle({
      left: '1px',
      top: '5px',
      width: '10px',
      height: '12px',
    });
  });

  it('draws every system of a backend range under the same test id', () => {
    render(
      <SelectionOverlays
        {...base}
        hasBackendHighlighting
        selectionBoxes={[box(1), box(50)]}
        primaryRect={box(1)}
      />,
    );
    expect(screen.getAllByTestId('selection-overlay')).toHaveLength(2);
  });

  it('draws numbered rectangles for a multi-selection, lighter for whole-bar boxes', () => {
    render(
      <SelectionOverlays {...base} selectionBoxes={[box(1), box(20, { isMeasureBbox: true })]} />,
    );
    expect(screen.getByTestId('selection-overlay-0').className).toContain('bg-accent/25');
    expect(screen.getByTestId('selection-overlay-1').className).not.toContain('bg-accent/25');
    expect(screen.queryByTestId('selection-overlay')).toBeNull();
  });

  it('draws nothing while the overlay is suppressed, and keeps the secondary boxes for tests and feedback', () => {
    const { container } = render(
      <SelectionOverlays
        {...base}
        overlaySuppressed
        primaryRect={box(1)}
        selectionBoxes={[box(1), box(9)]}
        secondaryBoxes={[box(3)]}
      />,
    );
    expect(screen.queryByTestId('selection-overlay')).toBeNull();
    expect(screen.queryByTestId('selection-overlay-0')).toBeNull();
    expect(container.children).toHaveLength(1);
  });

  it('shows the numbered boxes, not the single rectangle, as soon as two things are selected', () => {
    render(<SelectionOverlays {...base} primaryRect={box(1)} selectionBoxes={[box(1), box(20)]} />);
    expect(screen.queryByTestId('selection-overlay')).toBeNull();
    expect(screen.getAllByTestId(/selection-overlay-/)).toHaveLength(2);
  });

  it('prefers the backend boxes to the primary rectangle', () => {
    render(
      <SelectionOverlays
        {...base}
        hasBackendHighlighting
        primaryRect={box(1)}
        selectionBoxes={[]}
      />,
    );
    expect(screen.queryByTestId('selection-overlay')).toBeNull();
  });
});

describe('InlineTextEditor', () => {
  const setup = (over: Record<string, unknown> = {}) => {
    const props = {
      rect: { x: 4, y: 6, w: 100, h: 20 },
      zoom: 2,
      contentRef: { current: null as HTMLDivElement | null },
      editedRef: { current: false },
      selectedTextValue: 'Allegro',
      onChange: vi.fn(),
      onApply: vi.fn(async () => undefined),
      onClose: vi.fn(),
      ...over,
    };
    render(<InlineTextEditor {...props} />);
    return props;
  };

  it('sits at the text, counter-scaled so it is always shown at 100%, with a floor on its size', () => {
    setup();
    expect(screen.getByTestId('inline-text-editor')).toHaveStyle({
      left: '4px',
      top: '6px',
      minWidth: '160px',
      minHeight: '30px',
      transform: 'scale(0.5)',
    });
  });

  it('reports typing and marks the text as edited', () => {
    const props = setup();
    const editable = screen.getByTestId('inline-text-content');
    editable.textContent = 'Presto';
    fireEvent.input(editable);
    expect(props.editedRef.current).toBe(true);
    expect(props.onChange).toHaveBeenCalledWith('Presto');
    expect(props.contentRef.current).toBe(editable);
  });

  it('closes on Escape and saves-and-closes on Ctrl+Enter or Cmd+Enter, but not on plain Enter', () => {
    const props = setup();
    const editable = screen.getByTestId('inline-text-content');
    editable.textContent = 'Presto';
    fireEvent.keyDown(editable, { key: 'Enter' });
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(editable, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(editable, { key: 'Enter', ctrlKey: true });
    expect(props.onApply).toHaveBeenLastCalledWith('Presto');
    fireEvent.keyDown(editable, { key: 'Enter', metaKey: true });
    expect(props.onApply).toHaveBeenCalledTimes(2);
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  it('Save applies what is typed (or the selected value when nothing is), Cancel just closes', () => {
    const props = setup();
    screen.getByTestId('inline-text-content').textContent = 'Presto';
    fireEvent.click(screen.getByText('Save'));
    expect(props.onApply).toHaveBeenCalledWith('Presto');
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps pointer and click events inside the editor away from the score', () => {
    setup();
    const outer = vi.fn();
    document.body.addEventListener('click', outer);
    document.body.addEventListener('mousedown', outer);
    document.body.addEventListener('pointerdown', outer);
    fireEvent.click(screen.getByTestId('inline-text-editor'));
    fireEvent.mouseDown(screen.getByTestId('inline-text-editor'));
    fireEvent.pointerDown(screen.getByTestId('inline-text-editor'));
    expect(outer).not.toHaveBeenCalled();
    document.body.removeEventListener('click', outer);
    document.body.removeEventListener('mousedown', outer);
    document.body.removeEventListener('pointerdown', outer);
  });
});

describe('ScoreCanvas', () => {
  const setup = (over: Record<string, unknown> = {}) => {
    const props = {
      scrollContainerRef: { current: null as HTMLDivElement | null },
      scoreWrapperRef: { current: null as HTMLDivElement | null },
      containerRef: { current: null as HTMLDivElement | null },
      onScrollTop: null as ((scrollTop: number) => void) | null,
      insets: { left: 0, right: 0 },
      growsToContent: false,
      hiddenUnderRows: false,
      loading: false,
      hasScore: true,
      zoom: 1.5,
      noteInputActive: false,
      paletteDropActive: false,
      onWrapperClick: vi.fn(),
      editing: null as Record<string, unknown> | null,
      ...over,
    };
    const view = render(
      <ScoreCanvas {...(props as unknown as React.ComponentProps<typeof ScoreCanvas>)}>
        <span data-testid="overlay-child" />
      </ScoreCanvas>,
    );
    return { props, ...view };
  };

  it('holds the score container inside a zoomed wrapper, with the overlays inside the wrapper', () => {
    const { props } = setup();
    const wrapper = screen.getByTestId('score-wrapper');
    expect(wrapper).toHaveStyle({ transform: 'scale(1.5)', width: 'fit-content' });
    expect(wrapper).toContainElement(screen.getByTestId('svg-container'));
    expect(wrapper).toContainElement(screen.getByTestId('overlay-child'));
    expect(props.containerRef.current).toBe(screen.getByTestId('svg-container'));
    expect(props.scoreWrapperRef.current).toBe(wrapper);
    expect(props.scrollContainerRef.current).toContainElement(wrapper);
  });

  it('says when it is loading or has no score, and not otherwise', () => {
    setup({ loading: true });
    expect(screen.getByText('Loading score...')).toBeInTheDocument();
    expect(screen.queryByText(/No score loaded/)).toBeNull();
    cleanup();
    setup({ loading: true, hasScore: false });
    expect(screen.getByText('Loading score...')).toBeInTheDocument();
    expect(screen.queryByText(/No score loaded/)).toBeNull();
    cleanup();
    setup({ hasScore: false });
    expect(screen.getByText('No score loaded. Open a file to begin.')).toBeInTheDocument();
    expect(screen.queryByText('Loading score...')).toBeNull();
    cleanup();
    setup();
    expect(screen.queryByText(/No score loaded|Loading score/)).toBeNull();
  });

  it('shows the note-input crosshair and the palette-drop ring', () => {
    setup({ noteInputActive: true, paletteDropActive: true });
    const wrapper = screen.getByTestId('score-wrapper');
    expect(wrapper).toHaveStyle({ cursor: 'crosshair' });
    expect(wrapper).toHaveAttribute('data-palette-drop-active', 'true');
    expect(wrapper.className).toContain('ring-accent/60');
    cleanup();
    setup();
    expect(screen.getByTestId('score-wrapper')).toHaveAttribute(
      'data-palette-drop-active',
      'false',
    );
    expect(screen.getByTestId('score-wrapper').style.cursor).toBe('');
  });

  it('pads for the workspace insets, and scrolls sideways unless the frame grows to its content', () => {
    const { props } = setup({ insets: { left: 40, right: 8 } });
    expect(props.scrollContainerRef.current).toHaveStyle({
      paddingLeft: 'calc(2rem + 40px)',
      paddingRight: 'calc(2rem + 8px)',
    });
    expect(props.scrollContainerRef.current!.className).toContain('overflow-auto');
    cleanup();
    const grown = setup({ growsToContent: true, hiddenUnderRows: true });
    expect(grown.props.scrollContainerRef.current!.className).toContain('overflow-x-clip');
    expect(grown.props.scrollContainerRef.current!.className).toContain('hidden');
    expect(grown.props.scrollContainerRef.current!.getAttribute('style')).toBeNull();
  });

  it('tells the review gutter how far it scrolled', () => {
    const onScrollTop = vi.fn();
    const { props } = setup({ onScrollTop });
    const scroller = props.scrollContainerRef.current!;
    scroller.scrollTop = 120;
    fireEvent.scroll(scroller);
    expect(onScrollTop).toHaveBeenCalledWith(120);
    cleanup();
    const quiet = setup();
    expect(() => fireEvent.scroll(quiet.props.scrollContainerRef.current!)).not.toThrow();
  });

  it('binds only the click when the score cannot be edited, and every gesture when it can', () => {
    const view = setup();
    fireEvent.click(screen.getByTestId('score-wrapper'));
    expect(view.props.onWrapperClick).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(screen.getByTestId('score-wrapper'));
    cleanup();

    const handlers = Object.fromEntries(
      [
        'onDoubleClick',
        'onPointerDown',
        'onPointerMove',
        'onPointerUp',
        'onPointerCancel',
        'onPointerLeave',
        'onMouseDown',
        'onMouseMove',
        'onMouseUp',
        'onContextMenu',
        'onDragOver',
        'onDragLeave',
        'onDrop',
      ].map((name) => [name, vi.fn()]),
    );
    setup({ editing: handlers });
    const wrapper = screen.getByTestId('score-wrapper');
    fireEvent.doubleClick(wrapper);
    fireEvent.pointerDown(wrapper);
    fireEvent.pointerMove(wrapper);
    fireEvent.pointerUp(wrapper);
    fireEvent.pointerCancel(wrapper);
    fireEvent.pointerLeave(wrapper);
    fireEvent.mouseDown(wrapper);
    fireEvent.mouseMove(wrapper);
    fireEvent.mouseUp(wrapper);
    fireEvent.contextMenu(wrapper);
    fireEvent.dragOver(wrapper);
    fireEvent.dragLeave(wrapper);
    fireEvent.drop(wrapper);
    for (const [name, handler] of Object.entries(handlers)) {
      expect(handler, name).toHaveBeenCalledTimes(1);
    }
  });
});
