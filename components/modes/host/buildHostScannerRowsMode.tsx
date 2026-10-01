import { NO_INSETS } from '../../shell/vendor/viritura';
import { MODE_TRAITS, type OtsWorkspaceMode } from '../../shell/workspaceMode';
import type { BuildContext } from '../types';

/**
 * The scanner's rows view for a host page. It grows to its content and the host sizes its
 * frame to match (`layout: 'content'`); the engine's own canvas stays mounted but hidden.
 */
export function buildHostScannerRowsMode({ nodes }: BuildContext): OtsWorkspaceMode {
  return {
    kind: 'host-scanner-rows',
    ...MODE_TRAITS['host-scanner-rows'],
    overlays: nodes.floatingPalettes,
    body: nodes.canvas(NO_INSETS),
    siblings: (
      <>
        {nodes.dialogs}
        {nodes.compare({ variant: 'rows', placement: 'overlay', hosted: true, grows: true })}
        {nodes.hostBusy}
      </>
    ),
    commands: [],
  };
}
