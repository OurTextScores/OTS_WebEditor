import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CompareScorePane,
  type CompareScorePaneActions,
  type CompareScorePaneModel,
} from '../components/score-editor/compare/CompareScorePane';

const makeModel = (): CompareScorePaneModel => ({
  side: 'left',
  label: 'Proposal',
  isCurrent: false,
  isActive: true,
  embedded: true,
  scoreAvailable: true,
  editorBusy: false,
  noteInputActive: true,
  zoom: 0.8,
  wrapperStyle: { width: 400, height: 300 },
  transport: { isPlaying: false, isPaused: false, isBusy: false },
  checkpoint: null,
  viewportStatus: null,
  diffHighlights: [{ id: 'diff', left: 1, top: 2, width: 3, height: 4, status: 'new-diff' }],
  positiveDiffStatus: 'new-diff',
  negativeDiffStatus: null,
  commentedHighlights: [],
  threadedHighlights: [],
  selectionRects: [{ x: 5, y: 6, w: 7, h: 8 }],
  noteInputCursor: {
    rect: { x: 9, y: 10, width: 2, height: 12, voice: 1 },
    color: '#2563eb',
  },
  focusedHighlight: null,
  measureHitAreaAvailable: true,
});

const makeActions = (): CompareScorePaneActions => ({
  activate: vi.fn(),
  openInEditor: vi.fn(),
  togglePlayPause: vi.fn(),
  stop: vi.fn(),
  setCheckpointLabel: vi.fn(),
  saveCheckpoint: vi.fn(),
  zoomOut: vi.fn(),
  zoomIn: vi.fn(),
  addBar: vi.fn(),
  toggleNoteInput: vi.fn(),
  openPalettes: vi.fn(),
  clickScore: vi.fn(),
});

describe('CompareScorePane', () => {
  it('renders role-neutral pane state and routes actions without a Score object', () => {
    const actions = makeActions();
    render(
      <CompareScorePane
        model={makeModel()}
        actions={actions}
        paneRefs={{ scroll: createRef(), wrapper: createRef(), container: createRef() }}
      />,
    );

    expect(screen.getByText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint')).toBeInTheDocument();
    expect(screen.getByTestId('compare-selection-overlay-left')).toBeInTheDocument();
    expect(screen.getByTestId('compare-note-input-cursor-left')).toHaveAttribute('data-voice', '1');
    expect(screen.getByTestId('compare-zoom-value-left')).toHaveTextContent('80%');

    fireEvent.click(screen.getByTestId('btn-compare-play-left'));
    fireEvent.click(screen.getByTestId('btn-compare-add-bar-left'));
    fireEvent.pointerDown(screen.getByTestId('compare-pane-left'));
    fireEvent.click(
      screen.getByTitle('Click to select this score and an element; click its bar to annotate'),
    );

    expect(actions.togglePlayPause).toHaveBeenCalledOnce();
    expect(actions.addBar).toHaveBeenCalledOnce();
    expect(actions.activate).toHaveBeenCalledOnce();
    expect(actions.clickScore).toHaveBeenCalledOnce();
  });
});
