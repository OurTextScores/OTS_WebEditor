import { describe, expect, it } from 'vitest';
import {
  addItem,
  edgeTurn,
  moveItem,
  newSetlist,
  pieceBeyond,
  removeItem,
  renameSetlist,
} from '../../components/performer/setlists/setlistModel';
import {
  memorySetlistStore,
  sortedSetlists,
} from '../../components/performer/setlists/setlistStore';

const piece = (name: string) => ({ score: `/${name}.mscz`, name });

describe('setlists', () => {
  it('adds, moves, removes and renames pieces', () => {
    let list = newSetlist('  Recital ', 1);
    expect(list.name).toBe('Recital');
    list = addItem(addItem(addItem(list, piece('a'), 2), piece('b'), 3), piece('c'), 4);
    expect(list.items.map((item) => item.name)).toEqual(['a', 'b', 'c']);
    list = moveItem(list, 2, -1, 5);
    expect(list.items.map((item) => item.name)).toEqual(['a', 'c', 'b']);
    expect(moveItem(list, 0, -1)).toBe(list); // already first
    list = removeItem(list, 0, 6);
    expect(list.items.map((item) => item.name)).toEqual(['c', 'b']);
    expect(list.updatedAt).toBe(6);
    expect(renameSetlist(list, '   ').name).toBe('Recital');
    expect(renameSetlist(list, 'Gala').name).toBe('Gala');
  });

  it('goes to the next piece on a second turn past the end', () => {
    expect(pieceBeyond(0, 3, 'next')).toBe(1);
    expect(pieceBeyond(2, 3, 'next')).toBeNull();
    expect(pieceBeyond(0, 3, 'previous')).toBeNull();
    // First press: the card; second: go
    expect(edgeTurn(null, 'next', 1)).toEqual({ card: 'next', go: false });
    expect(edgeTurn('next', 'next', 1)).toEqual({ card: null, go: true });
    // The other way puts the card away (and shows that way's, if there is a piece there)
    expect(edgeTurn('next', 'previous', null)).toEqual({ card: null, go: false });
    expect(edgeTurn('next', 'previous', 0)).toEqual({ card: 'previous', go: false });
  });

  it('keeps setlists, newest edited first', async () => {
    const store = memorySetlistStore();
    await store.put({ ...newSetlist('old', 1) });
    await store.put({ ...newSetlist('new', 2) });
    expect(sortedSetlists(await store.all()).map((list) => list.name)).toEqual(['new', 'old']);
  });
});
