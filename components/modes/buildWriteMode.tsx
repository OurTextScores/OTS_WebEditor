import { DockShell } from '../shell/DockShell';
import { writeDock } from '../shell/WriteWorkspace';
import { MODE_TRAITS, type OtsWorkspaceMode } from '../shell/workspaceMode';
import type { BuildContext } from './types';

/**
 * The default mode: write the score. Palettes, instruments, properties and the AI panels dock
 * around the canvas, under the Write toolbar.
 */
export function buildWriteMode({ nodes }: BuildContext): OtsWorkspaceMode {
  const { shell, panels } = writeDock(nodes.write);
  return {
    kind: 'write',
    ...MODE_TRAITS.write,
    activity: 'write',
    header: nodes.header,
    toolbar: nodes.writeToolbar,
    overlays: nodes.floatingPalettes,
    body: <DockShell canvas={nodes.canvas} panels={panels} {...shell} />,
    siblings: nodes.dialogs,
    statusBar: nodes.statusBar,
    commands: [],
  };
}
