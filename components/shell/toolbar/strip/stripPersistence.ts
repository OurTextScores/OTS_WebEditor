/**
 * The strip's remembered state, as an external store so React can read it without an effect:
 * the server and the first client render say "expanded", then the stored value takes over.
 * Browser storage can be absent or throw (private windows); the choice is then kept in memory for the session.
 */
const COLLAPSED_KEY = 'ots.toolstrip.collapsed';

const listeners = new Set<() => void>();
let session: boolean | null = null;

function readStored(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export const getStripCollapsed = (): boolean => session ?? readStored();
export const getStripCollapsedOnServer = (): boolean => false;

export function subscribeStripCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function writeStripCollapsed(collapsed: boolean): void {
  session = collapsed;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // Not remembered across sessions; the strip still works.
  }
  listeners.forEach((listener) => listener());
}

/** For tests: forget the in-memory choice so the next read goes to storage. */
export function resetStripCollapsedForTests(): void {
  session = null;
  listeners.forEach((listener) => listener());
}
