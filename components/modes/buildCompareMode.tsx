import { DockShell } from '../shell/DockShell';
import { MODE_TRAITS, type OtsWorkspaceMode } from '../shell/workspaceMode';
import type { BuildContext } from './types';

/**
 * A compare session started inside the editor (a checkpoint, a proposal, loaded scores).
 *
 * The compare view fills the workspace between the activity bar and the status bar, over the
 * score canvas. The canvas stays mounted underneath, at the same place in the tree as in
 * Write and History: the live engine instance and its render target belong to it, and the
 * compare's current pane reads from it.
 */
export function buildCompareMode({ nodes }: BuildContext): OtsWorkspaceMode {
  return {
    kind: 'compare',
    ...MODE_TRAITS.compare,
    activity: 'compare',
    header: nodes.header,
    toolbar: nodes.compareToolbar,
    overlays: nodes.floatingPalettes,
    body: <DockShell canvas={nodes.canvas} />,
    siblings: (
      <>
        {nodes.dialogs}
        {nodes.compare({ variant: 'default', placement: 'inline', hosted: false, grows: false })}
      </>
    ),
    statusBar: nodes.statusBar,
    commands: [],
  };
}
