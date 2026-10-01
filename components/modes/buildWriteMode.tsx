import { DockShell } from '../shell/DockShell';
import { writeDock } from '../shell/WriteWorkspace';
import { NO_INSETS } from '../shell/vendor/viritura';
import { MODE_TRAITS, type OtsWorkspaceMode } from '../shell/workspaceMode';
import type { BuildContext } from './types';

/**
 * The default mode: write the score. The v2 shell docks palettes, instruments, properties and
 * the AI panels around the canvas; the legacy shell keeps the ribbon's sidebars beside it.
 */
export function buildWriteMode({ legacy, nodes }: BuildContext): OtsWorkspaceMode {
  const { shell, panels } = writeDock(nodes.write);
  return {
    kind: 'write',
    ...MODE_TRAITS.write,
    activity: legacy ? undefined : 'write',
    header: nodes.header,
    toolbar: nodes.ribbon,
    overlays: nodes.floatingPalettes,
    body: legacy ? (
      <>
        {nodes.legacyHistorySidebar}
        {nodes.canvas(NO_INSETS)}
        {nodes.legacyPanels}
      </>
    ) : (
      <DockShell canvas={nodes.canvas} panels={panels} {...shell} />
    ),
    siblings: nodes.dialogs,
    statusBar: legacy ? undefined : nodes.statusBar,
    commands: [],
  };
}
