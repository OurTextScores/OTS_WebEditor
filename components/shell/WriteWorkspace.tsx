'use client';

import React, { type ReactNode } from 'react';
import { LeftDock, type LeftDockProps } from './LeftDock';
import { AiToolsPanel, ScoreSourcePanel } from './RightPanels';
import { PANEL_LIMITS, type useShellPanels } from './useShellPanels';
import type { WorkspaceDock } from './useWorkspaceDock';
import { WorkspaceShell, type WorkspaceInsets } from './vendor/viritura';
import type { AiToolsTab } from '../score-editor/ai-tools/AiToolsTabStrip';

/**
 * The Write mode's dock (SHELL_REDESIGN_DESIGN §4.1): the score canvas with the left dock
 * (Palettes, Instruments, Properties) and, on the right, the AI Tools panel and the Score
 * Source panel floated over its edges. The canvas receives the space they cover.
 */
export function WriteWorkspace({
  canvas,
  panelsVisible,
  onShowPanels,
  dock,
  widths,
  left,
  ai,
  source,
}: {
  canvas: (insets: WorkspaceInsets) => ReactNode;
  panelsVisible: boolean;
  onShowPanels: () => void;
  dock: WorkspaceDock;
  widths: ReturnType<typeof useShellPanels>;
  left: Pick<LeftDockProps, 'palettes' | 'instruments' | 'inspector'>;
  ai: {
    open: boolean;
    tool: AiToolsTab;
    onToolChange: (tool: AiToolsTab) => void;
    aiEnabled: boolean;
    loading: boolean;
    onClose: () => void;
    body: ReactNode;
  };
  source: { open: boolean; onClose: () => void; content: ReactNode };
}) {
  return (
    <WorkspaceShell
      canvas={canvas}
      showPanelHandle={!panelsVisible}
      onTogglePanels={onShowPanels}
      onOverlayDismiss={() => {
        // Too narrow to dock: the panels float over the score and give way when it is pressed.
        if (dock.open) dock.close();
        if (ai.open) ai.onClose();
        if (source.open) source.onClose();
      }}
    >
      {panelsVisible && dock.open && (
        <LeftDock
          side="left"
          width={widths.left.width}
          min={PANEL_LIMITS.left.min}
          onResize={widths.left.setWidth}
          dock={dock}
          {...left}
        />
      )}
      {panelsVisible && ai.open && (
        <AiToolsPanel
          side="right"
          width={widths.ai.width}
          min={PANEL_LIMITS.ai.min}
          onResize={widths.ai.setWidth}
          onClose={ai.onClose}
          tool={ai.tool}
          onToolChange={ai.onToolChange}
          aiEnabled={ai.aiEnabled}
          loading={ai.loading}
        >
          {ai.body}
        </AiToolsPanel>
      )}
      {panelsVisible && source.open && (
        <ScoreSourcePanel
          side="right"
          width={widths.source.width}
          min={PANEL_LIMITS.source.min}
          onResize={widths.source.setWidth}
          onClose={source.onClose}
        >
          {source.content}
        </ScoreSourcePanel>
      )}
    </WorkspaceShell>
  );
}
