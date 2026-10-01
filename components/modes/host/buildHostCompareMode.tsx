import { NO_INSETS } from '../../shell/vendor/viritura';
import { MODE_TRAITS, type OtsWorkspaceMode } from '../../shell/workspaceMode';
import type { BuildContext } from '../types';

/**
 * The compare embed OurTextScores frames (P6: chrome-less). The compare view is a fixed overlay
 * over the editor's own canvas, exactly as it was before the shell had modes.
 */
export function buildHostCompareMode({ nodes }: BuildContext): OtsWorkspaceMode {
  return {
    kind: 'host-compare',
    ...MODE_TRAITS['host-compare'],
    overlays: nodes.floatingPalettes,
    body: nodes.canvas(NO_INSETS),
    siblings: (
      <>
        {nodes.dialogs}
        {nodes.compare({ variant: 'default', placement: 'overlay', hosted: true, grows: false })}
        {nodes.hostBusy}
      </>
    ),
    commands: [],
  };
}
