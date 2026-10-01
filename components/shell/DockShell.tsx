'use client';

import React, { type ReactNode } from 'react';
import { WorkspaceShell, type WorkspaceInsets } from './vendor/viritura';

export interface DockShellProps {
  showPanelHandle?: boolean;
  onTogglePanels?: () => void;
  onOverlayDismiss?: () => void;
}

/**
 * The one canvas-and-panels frame every full-chrome mode renders at the same place in the
 * tree. That is deliberate: the score canvas holds the engine's render target, so if Write,
 * History and Compare each rendered their own component around it, switching activity would
 * unmount the canvas and lose the drawn score. Same element type, same position, and React
 * keeps the canvas while only the panels change.
 */
export function DockShell({
  canvas,
  panels,
  ...shell
}: DockShellProps & {
  canvas: (insets: WorkspaceInsets) => ReactNode;
  /** Direct children, never a fragment: the shell positions each panel it is given. */
  panels?: ReactNode;
}) {
  return (
    <WorkspaceShell canvas={canvas} {...shell}>
      {panels}
    </WorkspaceShell>
  );
}
