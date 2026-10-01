'use client';

import React, { type CSSProperties, type ReactNode } from 'react';
import type { AiToolsTab } from '../score-editor/ai-tools/AiToolsTabStrip';
import { AiToolPicker } from './AiToolPicker';
import { Panel } from './vendor/viritura';
import { PANEL_LIMITS } from './useShellPanels';

interface DockedPanelProps {
  /** `side` and `width` are read by the WorkspaceShell to position and stack the panel. */
  side: 'right';
  width: number;
  /** Also read by the shell, to know how far this panel may shrink. */
  min: number;
  onResize: (width: number) => void;
  onClose: () => void;
  shellStyle?: CSSProperties;
  children: ReactNode;
}

/**
 * The AI Tools panel: the tool picker in its header and the chosen tool's body below. It keeps
 * the legacy sidebar's test ids (`xml-sidebar`, `btn-xml-toggle`, `sidebar-resize-handle`).
 */
export function AiToolsPanel({
  tool,
  onToolChange,
  aiEnabled,
  loading,
  ...panel
}: DockedPanelProps & {
  tool: AiToolsTab;
  onToolChange: (tool: AiToolsTab) => void;
  aiEnabled: boolean;
  loading: boolean;
}) {
  return (
    <Panel
      {...panel}
      title="AI Tools"
      subtitle={loading ? 'Loading…' : undefined}
      actions={<AiToolPicker value={tool} onChange={onToolChange} aiEnabled={aiEnabled} />}
      closeLabel="Close AI Tools"
      closeTestId="btn-xml-toggle"
      onCollapse={panel.onClose}
      max={PANEL_LIMITS.ai.max}
      testId="xml-sidebar"
      resizeTestId="sidebar-resize-handle"
    >
      <div id="xml-sidebar-content" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
        {panel.children}
      </div>
    </Panel>
  );
}

/** The MusicXML source of the score, beside the AI tools: where an applied result shows up. */
export function ScoreSourcePanel(panel: DockedPanelProps) {
  return (
    <Panel
      {...panel}
      title="Score Source"
      closeLabel="Close Score Source"
      closeTestId="btn-musicxml-toggle"
      onCollapse={panel.onClose}
      max={PANEL_LIMITS.source.max}
    />
  );
}
