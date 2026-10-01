import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShellCommands } from '../../components/score-editor/useShellCommands';
import type { ShellEditorBindings } from '../../components/score-editor/shellCommands';
import { getShellUiState, resetShellUiForTests } from '../../components/shell/shellStore';
import { defaultCommandRegistry } from '../../lib/commands/registry';
import type { Score } from '../../lib/webmscore-loader';

const bindings = (over: Partial<ShellEditorBindings> = {}): ShellEditorBindings => ({
  score: null,
  aiEnabled: true,
  pageCount: 1,
  currentPage: 0,
  goToPage: vi.fn(async () => {}),
  goToNextPage: vi.fn(),
  goToPreviousPage: vi.fn(),
  inspectorOpen: false,
  setInspectorOpen: vi.fn(),
  musicXmlOpen: false,
  setMusicXmlOpen: vi.fn(),
  aiToolsOpen: false,
  setAiToolsOpen: vi.fn(),
  setAiTool: vi.fn(),
  setPanelsVisible: vi.fn(),
  setCheckpointsCollapsed: vi.fn(),
  setLeftSidebarTab: vi.fn(),
  zoom: 1,
  isPlaying: false,
  isPaused: false,
  interactionPreparing: false,
  dirty: false,
  checkpointCount: 0,
  pageCountIsFloor: false,
  progressiveLoadEnabled: true,
  toggleProgressiveLoad: vi.fn(),
  saveCheckpoint: vi.fn(),
  copySelection: vi.fn(),
  pasteSelection: vi.fn(),
  scoreSummaries: [],
  openScoreFromSummary: vi.fn(),
  ...over,
});

function Host({ value }: { value: ShellEditorBindings }) {
  useShellCommands(value);
  return null;
}

beforeEach(() => resetShellUiForTests());

describe('useShellCommands', () => {
  it('registers the commands and removes them on unmount', () => {
    const view = render(<Host value={bindings()} />);
    expect(defaultCommandRegistry.has('view.panel.history')).toBe(true);
    view.unmount();
    expect(defaultCommandRegistry.has('view.panel.history')).toBe(false);
  });

  it('publishes the view state the status bar and transport show', () => {
    render(
      <Host
        value={bindings({
          score: {} as Score,
          zoom: 1.5,
          currentPage: 2,
          pageCount: 5,
          pageCountIsFloor: true,
          dirty: true,
          checkpointCount: 3,
          isPlaying: true,
          interactionPreparing: true,
          progressiveLoadEnabled: false,
        })}
      />,
    );
    expect(getShellUiState().view).toEqual({
      zoom: 1.5,
      currentPage: 2,
      pageCount: 5,
      pageCountIsFloor: true,
      progressiveLoadEnabled: false,
      preparing: true,
      checkpointCount: 3,
      dirty: true,
      isPlaying: true,
      isPaused: false,
      hasScore: true,
    });
  });

  it('follows the editor as it changes', () => {
    const view = render(<Host value={bindings({ zoom: 1 })} />);
    view.rerender(<Host value={bindings({ zoom: 2, currentPage: 1, pageCount: 2 })} />);
    expect(getShellUiState().view).toMatchObject({ zoom: 2, currentPage: 1, hasScore: false });
  });

  it('publishes the recent scores, newest ten', () => {
    const scoreSummaries = Array.from({ length: 12 }, (_, i) => ({
      scoreId: `s${i}`,
      title: `T${i}`,
      lastUpdated: 100 - i,
      count: 1,
    }));
    render(<Host value={bindings({ scoreSummaries })} />);
    expect(getShellUiState().recentScores).toHaveLength(10);
    expect(getShellUiState().recentScores[0]).toEqual({
      scoreId: 's0',
      title: 'T0',
      lastUpdated: 100,
    });
  });
});
