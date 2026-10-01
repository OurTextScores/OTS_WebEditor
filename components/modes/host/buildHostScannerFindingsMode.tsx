import { NO_INSETS } from '../../shell/vendor/viritura';
import { MODE_TRAITS, type OtsWorkspaceMode } from '../../shell/workspaceMode';
import type { BuildContext } from '../types';

/**
 * The scanner's findings view for a host page. It grows to its content and the host sizes its
 * frame to match (`layout: 'content'`); the engine's own canvas stays mounted but hidden.
 */
export function buildHostScannerFindingsMode({ nodes }: BuildContext): OtsWorkspaceMode {
  return {
    kind: 'host-scanner-findings',
    ...MODE_TRAITS['host-scanner-findings'],
    overlays: nodes.floatingPalettes,
    body: nodes.canvas(NO_INSETS),
    siblings: (
      <>
        {nodes.dialogs}
        {nodes.compare({ variant: 'findings', placement: 'overlay', hosted: true, grows: true })}
        {nodes.hostBusy}
      </>
    ),
    commands: [],
  };
}
