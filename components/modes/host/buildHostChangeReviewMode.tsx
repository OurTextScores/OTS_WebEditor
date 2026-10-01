import { NO_INSETS } from '../../shell/vendor/viritura';
import { MODE_TRAITS, type OtsWorkspaceMode } from '../../shell/workspaceMode';
import type { BuildContext } from '../types';

/**
 * A single score under review: the canvas with the review gutter beside it, no chrome. The
 * canvas hands its clicks to the gutter (`interaction: 'review'`), so nothing here edits.
 */
export function buildHostChangeReviewMode({ nodes }: BuildContext): OtsWorkspaceMode {
  return {
    kind: 'host-change-review',
    ...MODE_TRAITS['host-change-review'],
    body: (
      <>
        {nodes.canvas(NO_INSETS)}
        {nodes.changeReviewPanel}
      </>
    ),
    siblings: (
      <>
        {nodes.dialogs}
        {nodes.hostBusy}
      </>
    ),
    commands: [],
  };
}
