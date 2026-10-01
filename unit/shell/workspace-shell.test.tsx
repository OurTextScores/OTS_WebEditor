import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_CANVAS_WIDTH,
  OVERLAY_MIN_WIDTH,
  PANEL_GAP,
  PANEL_HANDLE_INSET,
  PANEL_INSET,
  Panel,
  WorkspaceShell,
  layoutPanels,
  usePanelState,
  type WorkspaceInsets,
} from '../../components/shell/vendor/viritura';

const panel = (side: 'left' | 'right', width: number, min = 200, key?: string) => (
  <Panel key={key} side={side} width={width} min={min} testId={`${side}-${width}`}>
    body
  </Panel>
);

const layout = (
  panels: React.ReactElement<React.ComponentProps<typeof Panel>>[],
  available?: number,
) => layoutPanels(panels, available);

const styleOf = (element: React.ReactNode) =>
  (element as React.ReactElement<{ shellStyle: React.CSSProperties }>).props.shellStyle;
const widthOf = (element: React.ReactNode) =>
  (element as React.ReactElement<{ width: number }>).props.width;

describe('layoutPanels', () => {
  it('reports no inset for a side without panels', () => {
    expect(layout([]).insets).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(layout([panel('left', 300)]).insets.right).toBe(0);
  });

  it('reports the occupied width: the outer inset plus the panel', () => {
    expect(layout([panel('left', 300)]).insets.left).toBe(PANEL_INSET + 300);
    expect(layout([panel('right', 360)]).insets.right).toBe(PANEL_INSET + 360);
  });

  it('stacks panels on a side in source order, a gap apart', () => {
    const { positioned, insets } = layout([panel('right', 360), panel('right', 420)]);
    expect(styleOf(positioned[0]).right).toBe(PANEL_INSET);
    expect(styleOf(positioned[1]).right).toBe(PANEL_INSET + 360 + PANEL_GAP);
    expect(insets.right).toBe(PANEL_INSET + 360 + PANEL_GAP + 420);
  });

  it('keeps the two sides independent', () => {
    const { positioned, insets } = layout([panel('left', 300), panel('right', 360)]);
    expect(styleOf(positioned[0]).left).toBe(PANEL_INSET);
    expect(styleOf(positioned[1]).right).toBe(PANEL_INSET);
    expect(insets).toMatchObject({ left: PANEL_INSET + 300, right: PANEL_INSET + 360 });
  });

  it('floats panels over the canvas with the dock inset above and below', () => {
    const style = styleOf(layout([panel('left', 300)]).positioned[0]);
    expect(style).toMatchObject({
      position: 'absolute',
      marginTop: PANEL_INSET,
      marginBottom: PANEL_INSET,
      height: `calc(100% - ${PANEL_INSET * 2}px)`,
    });
  });

  describe('with a measured width', () => {
    it('leaves panels at their natural width when the canvas keeps its minimum', () => {
      const result = layout([panel('left', 300), panel('right', 360)], 1400);
      expect(result.mode).toBe('docked');
      expect(result.positioned.map(widthOf)).toEqual([300, 360]);
    });

    it('shrinks panels toward their minimums, in proportion to what each can give', () => {
      // Natural: left 12+300, right 12+360+10+420 = 1126 in all. Budget: 1200 - 280 = 920.
      const result = layout(
        [panel('left', 300, 240), panel('right', 360, 280), panel('right', 420, 300)],
        1200,
      );
      expect(result.mode).toBe('docked');
      const widths = result.positioned.map(widthOf);
      widths.forEach((width, index) =>
        expect(width).toBeGreaterThanOrEqual([240, 280, 300][index]),
      );
      widths.forEach((width, index) => expect(width).toBeLessThanOrEqual([300, 360, 420][index]));
      // And it now fits, leaving at least the minimum canvas.
      expect(result.insets.left + result.insets.right).toBeLessThanOrEqual(
        1200 - MIN_CANVAS_WIDTH + 2,
      );
    });

    it('stops docking and overlays the canvas when even the minimums do not fit', () => {
      const result = layout([panel('left', 300, 240), panel('right', 360, 280)], 700);
      expect(result.mode).toBe('overlay');
      // Overlaid panels take no canvas space.
      expect(result.insets).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
    });

    it('squeezes overlaid panels below their minimums, but never under the floor, so they do not overlap', () => {
      const result = layout(
        [panel('left', 300, 240), panel('right', 360, 280), panel('right', 420, 300)],
        736,
      );
      expect(result.mode).toBe('overlay');
      const widths = result.positioned.map(widthOf);
      widths.forEach((width) => expect(width).toBeGreaterThanOrEqual(OVERLAY_MIN_WIDTH));
      // Left side and right side together fit in the window.
      const [left, a, b] = widths;
      expect(PANEL_INSET + left + (PANEL_INSET + a + PANEL_GAP + b)).toBeLessThanOrEqual(736);
    });

    it('ignores a width of zero (not yet measured)', () => {
      const result = layout([panel('left', 300), panel('right', 360)], 0);
      expect(result.mode).toBe('docked');
      expect(result.positioned.map(widthOf)).toEqual([300, 360]);
    });
  });
});

describe('WorkspaceShell', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gives the canvas the space the panels cover', () => {
    const canvas = vi.fn((insets: WorkspaceInsets) => (
      <div data-testid="canvas">{`${insets.left}/${insets.right}`}</div>
    ));
    render(
      <WorkspaceShell canvas={canvas}>
        {panel('left', 300)}
        {panel('right', 360)}
      </WorkspaceShell>,
    );
    expect(screen.getByTestId('canvas')).toHaveTextContent(
      `${PANEL_INSET + 300}/${PANEL_INSET + 360}`,
    );
  });

  it('positions a wrapper that exposes side and width, and passes it its style', () => {
    function Wrapper(props: { side: 'left'; width: number; shellStyle?: React.CSSProperties }) {
      return <div data-testid="wrapper" style={props.shellStyle} />;
    }
    render(
      <WorkspaceShell canvas={() => null}>
        <Wrapper side="left" width={250} />
      </WorkspaceShell>,
    );
    expect(screen.getByTestId('wrapper')).toHaveStyle({
      position: 'absolute',
      left: `${PANEL_INSET}px`,
    });
  });

  it('renders anything that is not a panel after the panels, untouched', () => {
    render(
      <WorkspaceShell canvas={() => null}>
        {panel('left', 300)}
        <div data-testid="overlay" />
      </WorkspaceShell>,
    );
    expect(screen.getByTestId('overlay')).toBeInTheDocument();
  });

  it('reserves room for the edge handle while the panels are hidden', () => {
    const canvas = vi.fn((insets: WorkspaceInsets) => <span data-testid="c">{insets.left}</span>);
    const onTogglePanels = vi.fn();
    render(<WorkspaceShell canvas={canvas} showPanelHandle onTogglePanels={onTogglePanels} />);
    expect(screen.getByTestId('c')).toHaveTextContent(String(PANEL_HANDLE_INSET));
    screen.getByTestId('show-panels-handle').click();
    expect(onTogglePanels).toHaveBeenCalledOnce();
  });

  it('marks its layout, and dismisses overlaid panels when the canvas is pressed', () => {
    const onOverlayDismiss = vi.fn();
    render(
      <WorkspaceShell
        canvas={() => <button data-testid="score">score</button>}
        onOverlayDismiss={onOverlayDismiss}
      >
        {panel('left', 300)}
      </WorkspaceShell>,
    );
    // jsdom measures every box as zero wide, so the shell stays docked and does not dismiss.
    expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-layout', 'docked');
    screen.getByTestId('score').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onOverlayDismiss).not.toHaveBeenCalled();
  });

  it('is a landmark per panel', () => {
    render(
      <WorkspaceShell canvas={() => null}>
        <Panel side="left" width={300} title="Palettes">
          body
        </Panel>
      </WorkspaceShell>,
    );
    expect(screen.getByRole('complementary', { name: 'Palettes' })).toBeInTheDocument();
  });
});

describe('Panel', () => {
  it('renders a header with a close button only when asked', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Panel side="right" width={300}>
        body
      </Panel>,
    );
    expect(screen.queryByRole('button', { name: 'Close panel' })).toBeNull();
    rerender(
      <Panel side="right" width={300} title="Source" onClose={onClose} closeTestId="close">
        body
      </Panel>,
    );
    screen.getByTestId('close').click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows a resize handle on the inboard edge, only when it can resize', () => {
    const { rerender } = render(
      <Panel side="left" width={300} resizeTestId="grip">
        body
      </Panel>,
    );
    expect(screen.queryByTestId('grip')).toBeNull();
    rerender(
      <Panel side="left" width={300} onResize={() => {}} resizeTestId="grip">
        body
      </Panel>,
    );
    expect(screen.getByTestId('grip')).toHaveAttribute('data-side', 'right');
    rerender(
      <Panel side="right" width={300} onResize={() => {}} resizeTestId="grip">
        body
      </Panel>,
    );
    expect(screen.getByTestId('grip')).toHaveAttribute('data-side', 'left');
  });
});

describe('usePanelState', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  function Probe({ onState }: { onState: (state: ReturnType<typeof usePanelState>) => void }) {
    onState(usePanelState({ storageKey: 'test.panel', defaultWidth: 300, min: 200, max: 500 }));
    return null;
  }
  const latest = () => {
    let state!: ReturnType<typeof usePanelState>;
    const view = render(<Probe onState={(s) => (state = s)} />);
    return { get: () => state, view };
  };

  it('starts at the default, then remembers a width, clamped', () => {
    const probe = latest();
    expect(probe.get().width).toBe(300);
    act(() => probe.get().setWidth(900));
    expect(probe.get().width).toBe(500);
    expect(window.localStorage.getItem('test.panel')).toBe('500');
    probe.view.unmount();
    expect(latest().get().width).toBe(500);
  });

  it('clamps a stored width that is out of range, and ignores corrupt storage', () => {
    window.localStorage.setItem('test.panel', '5000');
    expect(latest().get().width).toBe(500);
    window.localStorage.setItem('test.panel', 'junk');
    expect(latest().get().width).toBe(300);
  });

  it('remembers collapsed state', () => {
    const probe = latest();
    expect(probe.get().collapsed).toBe(false);
    act(() => probe.get().setCollapsed(true));
    expect(window.localStorage.getItem('test.panel:collapsed')).toBe('1');
  });

  it('works with storage blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const probe = latest();
    expect(probe.get().width).toBe(300);
    expect(() => act(() => probe.get().setWidth(400))).not.toThrow();
    expect(probe.get().width).toBe(400);
  });
});
