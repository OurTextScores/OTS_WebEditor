import { needsSelectionOutsideInput, withCheck } from '../../lib/commands/selectionGates';
import { defineCommand, type AnyCommand } from '../../lib/commands/types';
import type { EditorCommandProps } from './editorProps';

/** Both surfaces use the same selection and engine-capability gates. */
export function buildStaffMoveCommands(getProps: () => EditorCommandProps): AnyCommand[] {
  return ([
    ['up', 'Move to staff above', 'onMoveStaffUp'],
    ['down', 'Move to staff below', 'onMoveStaffDown'],
  ] as const).map(([direction, label, handler]) => defineCommand({
    id: `format.staff.${direction}`,
    label,
    testId: `btn-move-staff-${direction}`,
    keywords: ['cross staff', 'move note'],
    enabled: withCheck(needsSelectionOutsideInput, () => Boolean(getProps()[handler])),
    run: async () => { await getProps()[handler]?.(); },
  }));
}
