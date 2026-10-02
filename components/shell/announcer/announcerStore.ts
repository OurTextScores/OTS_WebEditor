/**
 * What a screen reader is told that the screen shows only by changing: a selection, the result
 * of an edit, a mode switch (docs/private/DESIGN_LANGUAGE.md §6). A module-level store like the
 * notice service, so a command or an editor hook can call `announce()` without importing a
 * component. `Announcer` renders the latest message into a polite live region.
 */

export interface Announcement {
  /** Changes on every announce, so the same text twice in a row is read twice. */
  readonly id: number;
  readonly text: string;
}

const EMPTY: Announcement = { id: 0, text: '' };

let current: Announcement = EMPTY;
let counter = 0;
const listeners = new Set<() => void>();

export function announce(message: string): void {
  const text = message.trim();
  if (!text) return;
  counter += 1;
  current = { id: counter, text };
  listeners.forEach((listener) => listener());
}

export function getAnnouncement(): Announcement {
  return current;
}

export function subscribeToAnnouncements(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam. */
export function resetAnnouncements(): void {
  current = EMPTY;
  counter = 0;
  listeners.forEach((listener) => listener());
}
