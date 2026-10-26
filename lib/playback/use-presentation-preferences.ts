import { visualScoreTime } from './presentation-preferences';
import { useSyncExternalStore } from 'react';
import {
  getPresentationPreferences,
  getPresentationPreferencesOnServer,
  subscribePresentationPreferences,
} from './presentation-preferences';
export function usePresentationPreferences() {
  return useSyncExternalStore(
    subscribePresentationPreferences,
    getPresentationPreferences,
    getPresentationPreferencesOnServer,
  );
}

/** Both overlays share one preference snapshot; neither changes the transport's seek/time base. */
export function usePresentationTimes(positionMs: number) {
  const preferences = usePresentationPreferences();
  return {
    measure: visualScoreTime(positionMs, 'measure', preferences),
    cursor: visualScoreTime(positionMs, 'cursor', preferences),
  };
}
