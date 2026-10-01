import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspaceMode, type ModeNodes } from '../../components/modes';
import { EditorWorkspace } from '../../components/shell/EditorWorkspace';
import {
  MODE_TRAITS,
  type OtsModeKind,
  type OtsWorkspaceMode,
} from '../../components/shell/workspaceMode';

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

const ALL_KINDS = Object.keys(MODE_TRAITS) as OtsModeKind[];
const HOST_KINDS = ALL_KINDS.filter((kind) => kind.startsWith('host-'));

/** Marks the canvas so a test can tell whether it was remounted: the same node, or a new one. */
function Canvas() {
  return <div data-testid="canvas" />;
}

const nodes = (): ModeNodes => ({
  header: <header data-testid="header" />,
  ribbon: <div data-testid="ribbon" />,
  floatingPalettes: <div data-testid="palettes" />,
  statusBar: <footer data-testid="status" />,
  canvas: () => <Canvas />,
  changeReviewPanel: <div data-testid="review-gutter" />,
  legacyHistorySidebar: <aside data-testid="legacy-history" />,
  legacyPanels: <div data-testid="legacy-panels" />,
  write: {
    panelsVisible: true,
    onShowPanels: () => {},
    dock: { open: false, close: () => {} } as never,
    widths: {} as never,
    left: {} as never,
    ai: {
      open: false,
      tool: 'xml',
      onToolChange: () => {},
      aiEnabled: false,
      loading: false,
      onClose: () => {},
      body: null,
    } as never,
    source: { open: false, onClose: () => {}, content: null },
  },
  historyContent: <div data-testid="history-content" />,
  historyWidth: { width: 320, setWidth: () => {} } as never,
  dialogs: <div data-testid="dialogs" />,
  compare: ({ variant, placement, hosted, grows }) => (
    <div data-testid="compare" data-variant={variant} data-placement={placement}>
      {String(hosted)}:{String(grows)}
    </div>
  ),
  hostBusy: <div data-testid="busy" />,
});

const build = (kind: OtsModeKind, legacy = false): OtsWorkspaceMode =>
  buildWorkspaceMode(kind, { legacy, nodes: nodes() });

describe('mode traits', () => {
  it('give every kind a policy, and only the full-chrome modes can edit', () => {
    for (const kind of ALL_KINDS) expect(MODE_TRAITS[kind].interaction).toBeDefined();
    expect(MODE_TRAITS.write.interaction).toBe('edit');
    expect(MODE_TRAITS.compare.interaction).toBe('edit');
    expect(MODE_TRAITS.history.interaction).toBe('readonly');
    expect(MODE_TRAITS['host-change-review'].interaction).toBe('review');
    expect(MODE_TRAITS['host-scanner-rows'].interaction).toBe('readonly');
    expect(MODE_TRAITS['host-scanner-findings'].interaction).toBe('readonly');
  });

  it('draw no chrome on a host surface (P6) and all of it everywhere else', () => {
    for (const kind of HOST_KINDS) expect(MODE_TRAITS[kind].chrome).toBe('none');
    for (const kind of ALL_KINDS.filter((k) => !HOST_KINDS.includes(k))) {
      expect(MODE_TRAITS[kind].chrome).toBe('full');
    }
  });

  it('grow to their content only in the scanner row views', () => {
    const growing = ALL_KINDS.filter((kind) => MODE_TRAITS[kind].layout === 'content');
    expect(growing.sort()).toEqual(['host-scanner-findings', 'host-scanner-rows']);
  });

  it('read compare labels from the URL on every host surface', () => {
    for (const kind of HOST_KINDS) expect(MODE_TRAITS[kind].labelsFromUrl).toBe(true);
    expect(MODE_TRAITS.write.labelsFromUrl).toBe(false);
  });
});

describe('builders', () => {
  it.each(ALL_KINDS)('%s builds a mode of its own kind carrying its traits', (kind) => {
    const mode = build(kind);
    expect(mode.kind).toBe(kind);
    expect(mode).toMatchObject(MODE_TRAITS[kind]);
  });

  it('give host surfaces no header, toolbar, activity bar or status bar', () => {
    for (const kind of HOST_KINDS) {
      const mode = build(kind);
      expect(mode.header).toBeUndefined();
      expect(mode.toolbar).toBeUndefined();
      expect(mode.activity).toBeUndefined();
      expect(mode.statusBar).toBeUndefined();
    }
  });

  it('light the matching activity, and none under the legacy flag', () => {
    expect(build('write').activity).toBe('write');
    expect(build('history').activity).toBe('history');
    expect(build('compare').activity).toBe('compare');
    expect(build('write', true).activity).toBeUndefined();
    expect(build('compare', true).activity).toBeUndefined();
    expect(build('write', true).statusBar).toBeUndefined();
  });

  it('place the compare view over the workspace in v2 and over the window when legacy', () => {
    const placementOf = (legacy: boolean) => {
      render(<EditorWorkspace mode={build('compare', legacy)} />);
      const placement = screen.getByTestId('compare').getAttribute('data-placement');
      document.body.innerHTML = '';
      return placement;
    };
    expect(placementOf(false)).toBe('inline');
    expect(placementOf(true)).toBe('overlay');
  });

  it('hand each scanner view its own compare variant, hosted and growing', () => {
    render(<EditorWorkspace mode={build('host-scanner-rows')} />);
    expect(screen.getByTestId('compare')).toHaveAttribute('data-variant', 'rows');
    expect(screen.getByTestId('compare')).toHaveTextContent('true:true');
  });

  it('keep the host compare embed an overlay on the editor, with the busy spinner', () => {
    render(<EditorWorkspace mode={build('host-compare')} />);
    expect(screen.getByTestId('compare')).toHaveAttribute('data-placement', 'overlay');
    expect(screen.getByTestId('compare')).toHaveTextContent('true:false');
    expect(screen.getByTestId('busy')).toBeInTheDocument();
  });

  it('show the review gutter beside the canvas in a single-score change review', () => {
    render(<EditorWorkspace mode={build('host-change-review')} />);
    expect(screen.getByTestId('review-gutter')).toBeInTheDocument();
    expect(screen.queryByTestId('compare')).toBeNull();
  });
});

describe('EditorWorkspace', () => {
  it('fills the window for a viewport mode and grows for a content mode', () => {
    const { container, rerender } = render(<EditorWorkspace mode={build('write')} />);
    expect(container.firstElementChild).toHaveClass('h-screen');
    rerender(<EditorWorkspace mode={build('host-scanner-findings')} />);
    expect(container.firstElementChild).not.toHaveClass('h-screen');
    expect(container.firstElementChild).toHaveClass('overflow-x-clip');
  });

  it('shows the activity bar only when the mode has an activity', () => {
    const { rerender } = render(<EditorWorkspace mode={build('write')} />);
    expect(screen.getByTestId('activity-bar')).toBeInTheDocument();
    rerender(<EditorWorkspace mode={build('write', true)} />);
    expect(screen.queryByTestId('activity-bar')).toBeNull();
    rerender(<EditorWorkspace mode={build('host-compare')} />);
    expect(screen.queryByTestId('activity-bar')).toBeNull();
  });

  // The score canvas holds the engine's render target. If switching activity rebuilt the tree
  // around it, the drawn score would be lost and History would open on an empty page.
  it('keeps the very same canvas element across Write, History and Compare', () => {
    const { rerender } = render(<EditorWorkspace mode={build('write')} />);
    const canvas = screen.getByTestId('canvas');

    rerender(<EditorWorkspace mode={build('history')} />);
    expect(screen.getByTestId('canvas')).toBe(canvas);
    expect(screen.getByTestId('history-content')).toBeInTheDocument();

    rerender(<EditorWorkspace mode={build('compare')} />);
    expect(screen.getByTestId('canvas')).toBe(canvas);
    expect(screen.queryByTestId('history-content')).toBeNull();

    rerender(<EditorWorkspace mode={build('write')} />);
    expect(screen.getByTestId('canvas')).toBe(canvas);
  });

  it('keeps the legacy canvas across a compare session too', () => {
    const { rerender } = render(<EditorWorkspace mode={build('write', true)} />);
    const canvas = screen.getByTestId('canvas');
    act(() => rerender(<EditorWorkspace mode={build('compare', true)} />));
    expect(screen.getByTestId('canvas')).toBe(canvas);
  });
});
