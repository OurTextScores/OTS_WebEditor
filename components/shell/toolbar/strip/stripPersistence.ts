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

/**
 * The variant each split button last ran (SHELL_REDESIGN_DESIGN §23.11: split buttons run the last-used
 * variant, the first until one is used). Kept per control in one stored map, with the same fallbacks:
 * an external store so React reads it without an effect, held in memory when browser storage fails.
 */
const LAST_USED_KEY = 'ots.toolstrip.lastUsed';

const EMPTY_LAST_USED: Readonly<Record<string, string>> = {};
const lastUsedListeners = new Set<() => void>();
let lastUsedSession: Readonly<Record<string, string>> | null = null;
let lastUsedStored: { raw: string | null; value: Readonly<Record<string, string>> } | null = null;

function readLastUsed(): Readonly<Record<string, string>> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LAST_USED_KEY);
  } catch {
    return EMPTY_LAST_USED;
  }
  // The snapshot must be the same object while nothing changed, or React re-renders forever.
  if (lastUsedStored && lastUsedStored.raw === raw) return lastUsedStored.value;
  let value: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      value = Object.fromEntries(
        Object.entries(parsed).filter(([, item]) => typeof item === 'string'),
      ) as Record<string, string>;
    }
  } catch {
    // A corrupt value is the same as none.
  }
  lastUsedStored = { raw, value };
  return value;
}

export const getLastUsedMap = (): Readonly<Record<string, string>> =>
  lastUsedSession ?? readLastUsed();
export const getLastUsedMapOnServer = (): Readonly<Record<string, string>> => EMPTY_LAST_USED;

export function subscribeLastUsed(listener: () => void): () => void {
  lastUsedListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    lastUsedListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function writeLastUsed(controlId: string, itemId: string): void {
  const next = { ...getLastUsedMap(), [controlId]: itemId };
  lastUsedSession = next;
  try {
    window.localStorage.setItem(LAST_USED_KEY, JSON.stringify(next));
  } catch {
    // Remembered for this session only.
  }
  lastUsedListeners.forEach((listener) => listener());
}

/** For tests: forget the in-memory map so the next read goes to storage. */
export function resetLastUsedForTests(): void {
  lastUsedSession = null;
  lastUsedStored = null;
  lastUsedListeners.forEach((listener) => listener());
}
