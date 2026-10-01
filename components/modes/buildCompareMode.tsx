import { DockShell } from '../shell/DockShell';
import { NO_INSETS } from '../shell/vendor/viritura';
import { MODE_TRAITS, type OtsWorkspaceMode } from '../shell/workspaceMode';
import type { BuildContext } from './types';

/**
 * A compare session started inside the editor (a checkpoint, a proposal, loaded scores).
 *
 * v2: the compare view fills the workspace between the activity bar and the status bar, over
 * the score canvas. The canvas stays mounted underneath, at the same place in the tree as in
 * Write and History: the live engine instance and its render target belong to it, and the
 * compare's current pane reads from it.
 * Legacy: the compare view is the fixed overlay it has always been.
 */
export function buildCompareMode({ legacy, nodes }: BuildContext): OtsWorkspaceMode {
  const compare = (placement: 'overlay' | 'inline') =>
    nodes.compare({ variant: 'default', placement, hosted: false, grows: false });

  return {
    kind: 'compare',
    ...MODE_TRAITS.compare,
    activity: legacy ? undefined : 'compare',
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
      <DockShell canvas={nodes.canvas} />
    ),
    siblings: (
      <>
        {nodes.dialogs}
        {compare(legacy ? 'overlay' : 'inline')}
      </>
    ),
    statusBar: legacy ? undefined : nodes.statusBar,
    commands: [],
  };
}
