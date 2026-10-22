import type { Score } from '../../../lib/webmscore-loader';
import type { BooleanPropertyDefinition } from '../properties';

export const systemLockProperty = {
  name: 'systemLocked',
  label: 'Keep selected measures on one system',
  description:
    'Lock the selected measure span. Unlocking removes locks that overlap the selection.',
  defaultValue: false,
  resetLabel: 'Unlock selected measures',
} satisfies BooleanPropertyDefinition<'systemLocked'>;

export function hasSystemLockApi(score: Score | null): boolean {
  return Boolean(
    score &&
    typeof score.getSystemLockState === 'function' &&
    typeof score.setSystemLock === 'function' &&
    typeof score.moveSelectedMeasureToSystem === 'function',
  );
}
