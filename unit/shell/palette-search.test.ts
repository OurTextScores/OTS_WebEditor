import { afterEach, describe, expect, it, vi } from 'vitest';
import { MENUS, buildMenuPathIndex } from '../../components/shell/menus';
import {
  buildPaletteRows,
  readPaletteRecents,
  rememberPaletteRecent,
  searchPaletteRows,
  type PaletteRow,
} from '../../components/shell/paletteSearch';
import { DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import { allCommandsRegistry } from '../helpers/all-commands';

const row = (title: string, over: Partial<PaletteRow> = {}): PaletteRow => ({
  key: title,
  commandId: title,
  title,
  path: '',
  keywords: [],
  enabled: true,
  ...over,
});

describe('searchPaletteRows', () => {
  const rows = [
    row('Export PDF', { path: 'File ▸ Export', keywords: ['download'] }),
    row('Export PNG', { path: 'File ▸ Export' }),
    row('Undo'),
    row('Redo'),
    row('Dynamic: mf', { path: 'Add ▸ Marks ▸ Dynamics' }),
    row('Clef: Bass', { path: 'Add ▸ Signatures ▸ Clef' }),
  ];

  it('returns the first rows for an empty query', () => {
    expect(searchPaletteRows(rows, '', 2).map((r) => r.title)).toEqual([
      'Export PDF',
      'Export PNG',
    ]);
  });

  it('requires every token to match', () => {
    expect(searchPaletteRows(rows, 'export pdf').map((r) => r.title)).toEqual(['Export PDF']);
    expect(searchPaletteRows(rows, 'export zzz')).toEqual([]);
  });

  it('ranks a title prefix above a word start above a substring', () => {
    const ranked = searchPaletteRows(
      [row('Some Undo thing'), row('Superundo'), row('Undo')],
      'undo',
    ).map((r) => r.title);
    expect(ranked).toEqual(['Undo', 'Some Undo thing', 'Superundo']);
  });

  it('matches keywords and menu paths, below the title', () => {
    expect(searchPaletteRows(rows, 'download').map((r) => r.title)).toEqual(['Export PDF']);
    expect(searchPaletteRows(rows, 'marks').map((r) => r.title)).toEqual(['Dynamic: mf']);
  });

  it('is case-insensitive', () => {
    expect(searchPaletteRows(rows, 'CLEF').map((r) => r.title)).toEqual(['Clef: Bass']);
  });

  it('falls back to a subsequence of the title for longer queries', () => {
    expect(searchPaletteRows(rows, 'expdf').map((r) => r.title)).toEqual(['Export PDF']);
    // Too short to be a deliberate abbreviation.
    expect(searchPaletteRows(rows, 'ep')).toEqual([]);
  });

  it('prefers an available command to an unavailable one of equal relevance', () => {
    const ordered = searchPaletteRows(
      [row('Undo', { enabled: false, key: 'a' }), row('Undo', { key: 'b' })],
      'undo',
    );
    expect(ordered.map((r) => r.key)).toEqual(['b', 'a']);
  });

  it('keeps registry order for ties, and honours the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => row(`Item ${i}`));
    expect(searchPaletteRows(many, 'item', 3).map((r) => r.title)).toEqual([
      'Item 0',
      'Item 1',
      'Item 2',
    ]);
  });
});

describe('buildPaletteRows', () => {
  const registry = allCommandsRegistry();
  const paths = buildMenuPathIndex(MENUS, (id) => (registry.get(id) as { label?: string })?.label);
  const rows = buildPaletteRows(registry, DEFAULT_COMMAND_CONTEXT, paths);

  it('expands family variants into their own rows', () => {
    expect(rows.find((r) => r.title === 'Clef: Bass')).toMatchObject({
      commandId: 'add.clef',
      arg: 20,
      path: 'Add ▸ Signatures ▸ Clef',
    });
    expect(rows.find((r) => r.title === 'Dynamic: mf')).toMatchObject({
      commandId: 'add.mark.dynamic',
      arg: 8,
    });
  });

  it('gives each row a unique, stable key', () => {
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries shortcut, keywords and the menu path of a plain command', () => {
    expect(rows.find((r) => r.commandId === 'checkpoint.save')).toMatchObject({
      title: 'Save Checkpoint',
      shortcut: 'Mod+S',
      path: 'File',
    });
  });

  it('shows a variant with its own menu item where that item is', () => {
    expect(rows.find((r) => r.commandId === 'view.zoom.preset' && r.arg === 1)?.path).toBe('View');
    expect(rows.find((r) => r.commandId === 'view.zoom.preset' && r.arg === 0.5)?.path).toBe(
      'View ▸ Zoom',
    );
  });

  it('leaves out commands that need arguments the palette cannot ask for', () => {
    const ids = new Set(rows.map((r) => r.commandId));
    for (const id of ['instruments.add', 'instruments.part.remove', 'file.openRecent']) {
      expect(ids.has(id), id).toBe(false);
    }
    // Commands with a form are searchable.
    expect(ids.has('add.measures')).toBe(true);
  });

  it('marks rows unavailable from the live context', () => {
    // The default context has no score and nothing mutable.
    expect(rows.find((r) => r.commandId === 'edit.undo')?.enabled).toBe(false);
    expect(rows.find((r) => r.commandId === 'view.zoom.in')?.enabled).toBe(true);
  });

  it('finds the commands a user would look for', () => {
    expect(searchPaletteRows(rows, 'export pdf')[0].commandId).toBe('file.export.pdf');
    expect(searchPaletteRows(rows, 'time signature common')[0].title).toBe(
      'Time Signature: Common time',
    );
    expect(searchPaletteRows(rows, 'bass clef').some((r) => r.title === 'Clef: Bass')).toBe(true);
  });
});

describe('palette recents', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('remembers the latest first, without repeats, up to eight', () => {
    for (const key of ['a', 'b', 'c', 'a']) rememberPaletteRecent(key);
    expect(readPaletteRecents()).toEqual(['a', 'c', 'b']);
    for (let i = 0; i < 12; i += 1) rememberPaletteRecent(`k${i}`);
    expect(readPaletteRecents()).toHaveLength(8);
    expect(readPaletteRecents()[0]).toBe('k11');
  });

  it('survives corrupt or blocked storage', () => {
    window.localStorage.setItem('ots.palette.recents', '{not json');
    expect(readPaletteRecents()).toEqual([]);
    window.localStorage.setItem('ots.palette.recents', JSON.stringify([1, 'ok', null]));
    expect(readPaletteRecents()).toEqual(['ok']);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => rememberPaletteRecent('x')).not.toThrow();
  });
});
