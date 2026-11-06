import { deviceTable, memoryTable, type Table } from '../platform/performDb';
import type { Setlist } from './setlistModel';

export type SetlistStore = Table<Setlist>;

export const deviceSetlistStore = (): SetlistStore =>
  deviceTable<Setlist>('setlists', (setlist) => setlist.id);
export const memorySetlistStore = (initial: Setlist[] = []): SetlistStore =>
  memoryTable<Setlist>((setlist) => setlist.id, initial);

/** Setlists newest-edited first. */
export const sortedSetlists = (setlists: readonly Setlist[]) =>
  [...setlists].sort((a, b) => b.updatedAt - a.updatedAt);
