'use client';

import React from 'react';
import { useRegisterCommands } from '../../lib/commands/useRegisterCommands';
import { ActivityBar } from './ActivityBar';
import type { OtsWorkspaceMode } from './workspaceMode';

/**
 * Renders one `OtsWorkspaceMode` (SHELL_REDESIGN_DESIGN §7.3). It never inspects `kind`: the
 * frame is the same for every mode, and what differs is what the builder put in its slots.
 *
 * With `layout: 'content'` the whole chain grows to its content and lets the host scroll,
 * instead of filling the window; that is how the scanner's row views size their iframe.
 */
export function EditorWorkspace({ mode }: { mode: OtsWorkspaceMode }) {
  useRegisterCommands('mode', mode.commands);
  const content = mode.layout === 'content';

  return (
    <div className={content ? 'flex flex-col overflow-x-clip' : 'flex flex-col h-screen'}>
      {mode.header}
      {mode.toolbar}
      {mode.overlays}
      {/* `relative`: an inline compare view covers the body row, beside the activity bar. */}
      <div
        className={
          content ? 'flex' : `flex flex-1 min-h-0${mode.activity !== undefined ? ' relative' : ''}`
        }
      >
        {mode.activity !== undefined && <ActivityBar active={mode.activity} />}
        {mode.body}
        {mode.siblings}
      </div>
      {mode.statusBar}
    </div>
  );
}
