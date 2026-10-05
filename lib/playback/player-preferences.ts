/**
 * The embedded player's remembered choices (highlight mode, volume). Browser storage can be absent or throw (private
 * windows, blocked site data, a sandboxed iframe), and a preference is never worth breaking the player over.
 */
export function readPlayerPreference(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePlayerPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered; the choice still holds for this session.
  }
}
