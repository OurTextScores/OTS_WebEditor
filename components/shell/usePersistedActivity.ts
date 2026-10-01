import { useCallback, useState } from 'react';
import type { OtsActivity } from './workspaceMode';

const KEY = 'ots.shell.activity';

/** Corrupt or blocked storage means Write, the default activity. */
export function readActivity(): OtsActivity {
  try {
    return window.localStorage.getItem(KEY) === 'history' ? 'history' : 'write';
  } catch {
    return 'write';
  }
}

/**
 * The user-selected activity, remembered per browser. Compare is not stored here: it is entered
 * by state, and leaving it returns to whichever of these was selected before.
 */
export function usePersistedActivity(): readonly [OtsActivity, (activity: OtsActivity) => void] {
  const [activity, setActivityState] = useState<OtsActivity>(readActivity);
  const setActivity = useCallback((next: OtsActivity) => {
    setActivityState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Not remembering the activity is not worth failing the switch.
    }
  }, []);
  return [activity, setActivity] as const;
}
