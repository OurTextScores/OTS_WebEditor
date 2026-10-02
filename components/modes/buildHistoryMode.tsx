import { DockShell } from '../shell/DockShell';
import { HistoryPanel } from '../shell/HistoryWorkspace';
import { PANEL_LIMITS } from '../shell/useShellPanels';
import { MODE_TRAITS, type OtsWorkspaceMode } from '../shell/workspaceMode';
import type { BuildContext } from './types';

/**
 * The History activity: the current score, read-only, beside the checkpoint, version and score
 * lists. Everything that edits is
 * disabled, while File ▸ Export and the rest of the registry keep working.
 */
export function buildHistoryMode({ nodes }: BuildContext): OtsWorkspaceMode {
  return {
    kind: 'history',
    ...MODE_TRAITS.history,
    activity: 'history',
    header: nodes.header,
    toolbar: nodes.historyToolbar,
    overlays: nodes.floatingPalettes,
    body: (
      <DockShell
        canvas={nodes.canvas}
        panels={
          <HistoryPanel
            side="left"
            width={nodes.historyWidth.width}
            min={PANEL_LIMITS.history.min}
            onResize={nodes.historyWidth.setWidth}
          >
            {nodes.historyContent}
          </HistoryPanel>
        }
      />
    ),
    siblings: nodes.dialogs,
    statusBar: nodes.statusBar,
    commands: [],
  };
}
