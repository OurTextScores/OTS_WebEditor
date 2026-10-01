'use client';

import React, { type CSSProperties, type ReactNode } from 'react';
import { PANEL_LIMITS } from './useShellPanels';
import { Panel } from './vendor/viritura';

/**
 * The History activity's panel (SHELL_REDESIGN_DESIGN §4.3): the checkpoint, version and score
 * lists beside the read-only score. "Compare" on an entry enters Compare mode by state;
 * "Restore" brings the entry back into the editor.
 */
export function HistoryPanel({
  children,
  ...panel
}: {
  /** `side`, `width` and `min` are read by the WorkspaceShell to position and stack the panel. */
  side: 'left';
  width: number;
  min: number;
  onResize: (width: number) => void;
  shellStyle?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Panel
      {...panel}
      max={PANEL_LIMITS.history.max}
      title="History"
      testId="history-panel"
      scrollBody
    >
      {children}
    </Panel>
  );
}
