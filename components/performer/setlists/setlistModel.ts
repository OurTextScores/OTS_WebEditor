import type { TurnEvent } from '../turning/turnMachine';

/** One piece in a setlist: an OTS score (its URL or `local:<id>`) and the name shown for it. */
export interface SetlistItem {
  readonly score: string;
  readonly name: string;
}

/** An ordered list of pieces to perform in turn (performer mode, Phase 5). */
export interface Setlist {
  readonly id: string;
  readonly name: string;
  readonly items: readonly SetlistItem[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const newSetlist = (name: string, now = Date.now()): Setlist => ({
  id:
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `set-${now}-${Math.random()}`,
  name: name.trim() || 'Setlist',
  items: [],
  createdAt: now,
  updatedAt: now,
});

const edited = (setlist: Setlist, items: readonly SetlistItem[], now: number): Setlist => ({
  ...setlist,
  items,
  updatedAt: now,
});

export const addItem = (setlist: Setlist, item: SetlistItem, now = Date.now()) =>
  edited(setlist, [...setlist.items, item], now);

export const removeItem = (setlist: Setlist, index: number, now = Date.now()) =>
  edited(
    setlist,
    setlist.items.filter((_, at) => at !== index),
    now,
  );

/** Moves a piece one place up (-1) or down (+1); at either end nothing changes. */
export function moveItem(setlist: Setlist, index: number, by: -1 | 1, now = Date.now()): Setlist {
  const to = index + by;
  if (index < 0 || index >= setlist.items.length || to < 0 || to >= setlist.items.length)
    return setlist;
  const items = [...setlist.items];
  [items[index], items[to]] = [items[to], items[index]];
  return edited(setlist, items, now);
}

export const renameSetlist = (setlist: Setlist, name: string, now = Date.now()): Setlist => ({
  ...setlist,
  name: name.trim() || setlist.name,
  updatedAt: now,
});

/** The piece a turn past the edge of this one goes to (next past the last page, previous before the first), or null. */
export function pieceBeyond(index: number, count: number, event: TurnEvent): number | null {
  const to = event === 'next' ? index + 1 : index - 1;
  return to >= 0 && to < count ? to : null;
}

/**
 * The setlist edge: a turn past the end of a piece shows "Next: …" (or "Previous: …") and a second turn the same way
 * goes there; a turn the other way, or one that turns a page, puts the card away. Returns the new card and whether to
 * go now.
 */
export function edgeTurn(
  card: TurnEvent | null,
  event: TurnEvent,
  beyond: number | null,
): { card: TurnEvent | null; go: boolean } {
  if (beyond === null) return { card: null, go: false };
  if (card === event) return { card: null, go: true };
  return { card: event, go: false };
}
