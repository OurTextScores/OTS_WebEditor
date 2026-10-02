import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingPalettes } from '../../components/FloatingPalettes';
import { InspectorPanel } from '../../components/InspectorPanel';
import {
  MusicXmlPanel,
  type MusicXmlPanelProps,
} from '../../components/score-editor/MusicXmlPanel';
import { closeTopEscapeLayer } from '../../components/shell/keyboard/escapeLayers';
import { DockShell } from '../../components/shell/DockShell';
import { writeDock, type WriteDockProps } from '../../components/shell/WriteWorkspace';
import type { WorkspaceInsets } from '../../components/shell/vendor/viritura';
import { AiToolsPanel, ScoreSourcePanel } from '../../components/shell/RightPanels';
import {
  flattenInstrumentGroups,
  pickCommonInstruments,
} from '../../components/toolbar/instrumentChoices';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('FloatingPalettes', () => {
  it('offers to dock only when told how', () => {
    const { rerender } = render(<FloatingPalettes onApply={() => {}} onClose={() => {}} />);
    expect(screen.queryByTestId('btn-palettes-dock')).toBeNull();
    const onDock = vi.fn();
    rerender(<FloatingPalettes onApply={() => {}} onClose={() => {}} onDock={onDock} />);
    screen.getByTestId('btn-palettes-dock').click();
    expect(onDock).toHaveBeenCalledOnce();
  });

  it('remembers where it was moved, and starts there next time', () => {
    const view = render(<FloatingPalettes onApply={() => {}} onClose={() => {}} />);
    const handle = screen.getByTestId('floating-palettes-handle');
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { clientX: 50, clientY: 130, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 250, clientY: 330, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(JSON.parse(window.localStorage.getItem('ots.shell.palettesPosition')!)).toEqual({
      x: 224,
      y: 310,
    });
    view.unmount();
    render(<FloatingPalettes onApply={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('floating-palettes')).toHaveStyle({ left: '224px', top: '310px' });
  });

  it('ignores a corrupt stored position', () => {
    window.localStorage.setItem('ots.shell.palettesPosition', '{"x":"left"}');
    render(<FloatingPalettes onApply={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('floating-palettes')).toHaveStyle({ left: '24px', top: '110px' });
  });

  it('still closes on Escape', () => {
    const onClose = vi.fn();
    render(<FloatingPalettes onApply={() => {}} onClose={onClose} />);
    // Escape reaches it through the escape layers, which the keyboard router drives.
    expect(closeTopEscapeLayer()).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('InspectorPanel embedded', () => {
  it('drops the aside, its width and its collapse toggle, and keeps the content', () => {
    render(
      <InspectorPanel
        embedded
        data={
          {
            elementType: 'Note',
            selectionCount: 1,
            properties: { visible: { value: true, mixed: false } },
          } as never
        }
        onChange={() => {}}
      />,
    );
    const panel = screen.getByTestId('inspector-panel');
    expect(panel.tagName).toBe('DIV');
    expect(screen.queryByTestId('inspector-toggle')).toBeNull();
    expect(screen.getByTestId('inspector-visible')).toBeInTheDocument();
  });

  it('is still an aside with a toggle on its own, and renders nothing when collapsed', () => {
    const { rerender } = render(
      <InspectorPanel data={null} onChange={() => {}} onToggleCollapsed={() => {}} />,
    );
    expect(screen.getByTestId('inspector-panel').tagName).toBe('ASIDE');
    expect(screen.getByTestId('inspector-toggle')).toBeInTheDocument();
    rerender(<InspectorPanel data={null} onChange={() => {}} collapsed />);
    expect(screen.queryByTestId('inspector-panel')).toBeNull();
  });

  it('shows embedded even if the legacy collapsed flag is set', () => {
    render(<InspectorPanel data={null} onChange={() => {}} collapsed embedded />);
    expect(screen.getByTestId('inspector-panel')).toBeInTheDocument();
  });
});

describe('MusicXmlPanel embedded', () => {
  const base: MusicXmlPanelProps = {
    text: '<score-partwise/>',
    setText: () => {},
    setDirty: () => {},
    scoreLoaded: true,
    layout: { editorHeight: '10vh', editorMaxHeight: '20vh' },
    permissions: {
      applyEnabled: true,
      applyDisabled: false,
      reloadEnabled: true,
      controlsDisabled: false,
    },
    theme: { mode: 'light', setMode: () => {} },
    actions: { apply: () => {}, refresh: () => {}, close: vi.fn() },
  };

  it('is content only when embedded: no aside, no title, no close button', () => {
    render(<MusicXmlPanel {...base} embedded />);
    expect(screen.getByTestId('musicxml-sidebar').tagName).toBe('DIV');
    expect(screen.queryByTestId('btn-musicxml-toggle')).toBeNull();
    expect(screen.getByTestId('select-musicxml-theme')).toBeInTheDocument();
  });

  it('keeps its own aside and close button otherwise', () => {
    render(<MusicXmlPanel {...base} />);
    expect(screen.getByTestId('musicxml-sidebar').tagName).toBe('ASIDE');
    screen.getByTestId('btn-musicxml-toggle').click();
    expect(base.actions.close).toHaveBeenCalledOnce();
  });
});

describe('right panels', () => {
  it('AI Tools keeps the legacy test ids and closes from its header', () => {
    const onClose = vi.fn();
    render(
      <AiToolsPanel
        side="right"
        width={360}
        min={280}
        onResize={() => {}}
        onClose={onClose}
        tool="assistant"
        onToolChange={() => {}}
        aiEnabled
        loading
      >
        <div data-testid="tool-body" />
      </AiToolsPanel>,
    );
    expect(screen.getByTestId('xml-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-resize-handle')).toBeInTheDocument();
    expect(screen.getByTestId('tool-body')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    screen.getByTestId('btn-xml-toggle').click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Score Source is titled and closes', () => {
    const onClose = vi.fn();
    render(
      <ScoreSourcePanel side="right" width={420} min={300} onResize={() => {}} onClose={onClose}>
        body
      </ScoreSourcePanel>,
    );
    expect(screen.getByRole('complementary', { name: 'Score Source' })).toBeInTheDocument();
    screen.getByTestId('btn-musicxml-toggle').click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

/** Write mode's dock as the builder composes it: a DockShell around writeDock's panels. */
function WriteWorkspace({
  canvas,
  ...props
}: WriteDockProps & { canvas: (insets: WorkspaceInsets) => React.ReactNode }) {
  const { shell, panels } = writeDock(props);
  return <DockShell canvas={canvas} panels={panels} {...shell} />;
}

describe('WriteWorkspace', () => {
  const dock = (over: Record<string, unknown> = {}) =>
    ({
      open: true,
      tab: 'palettes',
      poppedOut: false,
      palettesDocked: true,
      palettesVisible: true,
      isShowing: () => true,
      show: vi.fn(),
      toggle: vi.fn(),
      close: vi.fn(),
      setPoppedOut: vi.fn(),
      togglePalettes: vi.fn(),
      openPalette: vi.fn(),
      ...over,
    }) as never;
  const widths = {
    left: { width: 296, setWidth: vi.fn(), collapsed: false, setCollapsed: vi.fn() },
    ai: { width: 360, setWidth: vi.fn(), collapsed: false, setCollapsed: vi.fn() },
    source: { width: 420, setWidth: vi.fn(), collapsed: false, setCollapsed: vi.fn() },
  };
  const left = {
    palettes: {
      disabled: false,
      dragEnabled: false,
      onApply: vi.fn(),
      category: null,
      onShowAll: vi.fn(),
    },
    instruments: { parts: [], groups: [] },
    inspector: { data: null, loading: false, disabled: false, onChange: vi.fn() },
  };
  const render_ = (
    over: { panelsVisible?: boolean; dock?: never; ai?: boolean; source?: boolean } = {},
  ) =>
    render(
      <WriteWorkspace
        canvas={() => <div data-testid="canvas" />}
        panelsVisible={over.panelsVisible ?? true}
        onShowPanels={vi.fn()}
        dock={over.dock ?? dock()}
        widths={widths as never}
        left={left as never}
        ai={{
          open: over.ai ?? false,
          tool: 'assistant',
          onToolChange: vi.fn(),
          aiEnabled: true,
          loading: false,
          onClose: vi.fn(),
          body: <i data-testid="ai-body" />,
        }}
        source={{
          open: over.source ?? false,
          onClose: vi.fn(),
          content: <i data-testid="source-body" />,
        }}
      />,
    );

  it('shows the dock alone by default', () => {
    render_();
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.getByTestId('left-dock')).toBeInTheDocument();
    expect(screen.queryByTestId('xml-sidebar')).toBeNull();
  });

  it('adds the right panels when open, AI Tools flush right with Score Source to its left', () => {
    render_({ ai: true, source: true });
    expect(screen.getByTestId('ai-body')).toBeInTheDocument();
    expect(screen.getByTestId('source-body')).toBeInTheDocument();
    const ai = screen.getByTestId('xml-sidebar');
    const source = screen.getByTestId('source-body').closest('aside')!;
    expect(ai).toHaveStyle({ right: '12px' });
    expect(source).toHaveStyle({ right: `${12 + 360 + 10}px` });
  });

  it('hides every panel and offers the edge handle when panels are hidden', () => {
    render_({ panelsVisible: false, ai: true, source: true });
    expect(screen.queryByTestId('left-dock')).toBeNull();
    expect(screen.queryByTestId('xml-sidebar')).toBeNull();
    expect(screen.getByTestId('show-panels-handle')).toBeInTheDocument();
  });

  it('shows no dock when it is closed', () => {
    render_({ dock: dock({ open: false }) });
    expect(screen.queryByTestId('left-dock')).toBeNull();
  });
});

describe('instrument choices', () => {
  it('flattens groups, carrying each group onto its instruments', () => {
    const flat = flattenInstrumentGroups([
      { id: 'g1', name: 'Strings', instruments: [{ id: 'violin', name: 'Violin' }] },
      { id: 'g2', name: 'Keys', instruments: [{ id: 'piano', name: 'Piano', groupName: 'Own' }] },
    ]);
    expect(flat).toEqual([
      { id: 'violin', name: 'Violin', groupId: 'g1', groupName: 'Strings' },
      { id: 'piano', name: 'Piano', groupId: 'g2', groupName: 'Own' },
    ]);
  });

  it('picks the common instruments present, in preference order, once each, with their labels', () => {
    const picked = pickCommonInstruments([
      { id: 'harp', name: 'Harp' },
      { id: 'contrabass', name: 'Contrabass' },
      { id: 'piano', name: 'Piano' },
      { id: 'cello', name: 'Cello' },
      { id: 'violoncello', name: 'Violoncello' },
    ]);
    expect(picked.map((entry) => entry.label)).toEqual(['Piano', 'Violoncello', 'Double Bass']);
  });

  it('finds nothing in an empty list', () => {
    expect(pickCommonInstruments([])).toEqual([]);
  });
});
