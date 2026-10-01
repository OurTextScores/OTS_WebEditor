'use client';

import React, { type ReactNode } from 'react';
import { LeftDock, type LeftDockProps } from './LeftDock';
import { AiToolsPanel, ScoreSourcePanel } from './RightPanels';
import { PANEL_LIMITS, type useShellPanels } from './useShellPanels';
import type { WorkspaceDock } from './useWorkspaceDock';
import type { DockShellProps } from './DockShell';
import type { AiToolsTab } from '../score-editor/ai-tools/AiToolsTabStrip';

/**
 * The Write mode's dock (SHELL_REDESIGN_DESIGN §4.1): the score canvas with the left dock
 * (Palettes, Instruments, Properties) and, on the right, the AI Tools panel and the Score
 * Source panel floated over its edges. The canvas receives the space they cover.
 */
export type WriteDockProps = Parameters<typeof writeDock>[0];

export function writeDock({
  panelsVisible,
  onShowPanels,
  dock,
  widths,
  left,
  ai,
  source,
}: {
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
}): { shell: DockShellProps; panels: ReactNode[] } {
  return {
    shell: {
      showPanelHandle: !panelsVisible,
      onTogglePanels: onShowPanels,
      onOverlayDismiss: () => {
        // Too narrow to dock: the panels float over the score and give way when it is pressed.
        if (dock.open) dock.close();
        if (ai.open) ai.onClose();
        if (source.open) source.onClose();
      },
    },
    // An array, not a fragment: the WorkspaceShell positions its direct children.
    panels: [
      panelsVisible && dock.open && (
        <LeftDock
          key="left"
          side="left"
          width={widths.left.width}
          min={PANEL_LIMITS.left.min}
          onResize={widths.left.setWidth}
          dock={dock}
          {...left}
        />
      ),
      panelsVisible && ai.open && (
        <AiToolsPanel
          key="ai"
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
      ),
      panelsVisible && source.open && (
        <ScoreSourcePanel
          key="source"
          side="right"
          width={widths.source.width}
          min={PANEL_LIMITS.source.min}
          onResize={widths.source.setWidth}
          onClose={source.onClose}
        >
          {source.content}
        </ScoreSourcePanel>
      ),
    ],
  };
}
