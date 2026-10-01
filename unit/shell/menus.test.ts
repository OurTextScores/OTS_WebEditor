import { describe, expect, it } from 'vitest';
import {
  MENUS,
  buildMenuPathIndex,
  menuCommandIds,
  variantPathKey,
  type MenuNode,
} from '../../components/shell/menus';
import { pruneMenuNodes } from '../../components/shell/menuTree';
import { CommandRegistry } from '../../lib/commands/registry';
import { defineCommand, isCommandFamily } from '../../lib/commands/types';
import { allCommandsRegistry } from '../helpers/all-commands';

/**
 * The menu bar is complete (P3): every command is reachable from it, and every entry in it
 * names a command that exists. The registry is the authority; the tree is data.
 */
describe('menu tree', () => {
  const registry = allCommandsRegistry();
  const inMenus = menuCommandIds();

  it('names only commands that are registered', () => {
    const missing = [...inMenus].filter((id) => !registry.has(id));
    expect(missing, 'Register these, or take them out of menus.ts.').toEqual([]);
  });

  /**
   * Commands deliberately not in a menu, each with the reason.
   */
  const NOT_IN_MENUS: Record<string, string> = {
    'playback.playPause': 'header transport arrives in Phase 2',
    'playback.stop': 'header transport arrives in Phase 2',
    'playback.playFromSelection': 'header transport arrives in Phase 2',
    'instruments.add': 'the Instruments panel arrives in Phase 3',
    'instruments.part.toggleVisible': 'the Instruments panel arrives in Phase 3',
    'instruments.part.remove': 'the Instruments panel arrives in Phase 3',
    'view.goto.page': 'reached through the palette (p3) and the Go to prompt',
    'view.goto.bar': 'reached through the palette (m125) and the Go to prompt',
    'view.goto.rehearsal': 'reached through the palette (rA) and the Go to prompt',
  };

  it('reaches every other command from a menu', () => {
    const unreachable = registry
      .ids()
      .filter((id) => !inMenus.has(id) && !(id in NOT_IN_MENUS) && id !== 'file.openRecent');
    expect(unreachable, 'Add these to menus.ts, or exempt them above with a reason.').toEqual([]);
  });

  it('does not exempt a command that is in a menu', () => {
    expect(Object.keys(NOT_IN_MENUS).filter((id) => inMenus.has(id))).toEqual([]);
  });

  it('places each plain command once', () => {
    const counts = new Map<string, number>();
    const visit = (nodes: readonly MenuNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'submenu') visit(node.children);
        else if (node.kind === 'item' && node.arg === undefined) {
          counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
        } else if (node.kind === 'family') {
          counts.set(`family:${node.id}`, (counts.get(`family:${node.id}`) ?? 0) + 1);
        }
      }
    };
    for (const menu of MENUS) visit(menu.children);
    expect([...counts].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('only gives a family variant an item of its own when the variant exists', () => {
    const bad: string[] = [];
    const visit = (nodes: readonly MenuNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'submenu') visit(node.children);
        else if (node.kind === 'item' && node.arg !== undefined) {
          const entry = registry.get(node.id);
          const variants =
            entry && isCommandFamily(entry)
              ? (entry as unknown as { variants: { arg: unknown }[] }).variants
              : [];
          if (
            !variants.some((variant) => JSON.stringify(variant.arg) === JSON.stringify(node.arg))
          ) {
            bad.push(`${node.id}(${JSON.stringify(node.arg)})`);
          }
        }
      }
    };
    for (const menu of MENUS) visit(menu.children);
    expect(bad).toEqual([]);
  });

  it('uses the MuseScore 4 top-level menus, in order', () => {
    expect(MENUS.map((menu) => menu.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Add',
      'Format',
      'Tools',
      'Help',
    ]);
  });
});

describe('pruneMenuNodes', () => {
  const make = (...ids: string[]) => {
    const registry = new CommandRegistry();
    registry.register(
      'global',
      ids.map((id) => defineCommand({ id, label: id, run: () => {} })),
    );
    return registry;
  };
  const item = (id: string): MenuNode => ({ kind: 'item', id });
  const separator: MenuNode = { kind: 'separator' };

  it('hides entries whose command is not registered', () => {
    expect(pruneMenuNodes([item('a'), item('b')], make('a'))).toEqual([item('a')]);
  });

  it('drops a submenu that ends up empty, and keeps one that does not', () => {
    const nodes: MenuNode[] = [
      { kind: 'submenu', label: 'Empty', children: [item('missing')] },
      { kind: 'submenu', label: 'Full', children: [item('a'), item('missing')] },
    ];
    expect(pruneMenuNodes(nodes, make('a'))).toEqual([
      { kind: 'submenu', label: 'Full', children: [item('a')] },
    ]);
  });

  it('collapses separators that lead, trail or double up after pruning', () => {
    const nodes: MenuNode[] = [
      separator,
      item('missing'),
      separator,
      item('a'),
      separator,
      item('missing'),
      separator,
      item('b'),
      separator,
    ];
    expect(pruneMenuNodes(nodes, make('a', 'b'))).toEqual([item('a'), separator, item('b')]);
  });

  it('keeps Open Recent only when its command is registered', () => {
    const nodes: MenuNode[] = [{ kind: 'recentScores' }, item('a')];
    expect(pruneMenuNodes(nodes, make('a'))).toEqual([item('a')]);
    expect(pruneMenuNodes(nodes, make('a', 'file.openRecent'))).toEqual(nodes);
  });
});

describe('buildMenuPathIndex', () => {
  const paths = buildMenuPathIndex(MENUS, (id) =>
    id === 'add.mark.dynamic' ? 'Dynamic' : undefined,
  );

  it('records where a plain command lives', () => {
    expect(paths.get('file.export.pdf')).toBe('File ▸ Export');
    expect(paths.get('add.text.tempo')).toBe('Add ▸ Text');
  });

  it('records a family under its submenu, or its parent when inline', () => {
    expect(paths.get('add.mark.dynamic\0*')).toBe('Add ▸ Marks ▸ Dynamics');
    expect(paths.get('edit.duration.set\0*')).toBe('Edit ▸ Duration');
  });

  it('gives a variant with its own menu item that item’s location', () => {
    expect(paths.get(variantPathKey('view.zoom.preset', 1))).toBe('View');
    expect(paths.get('view.zoom.preset\0*')).toBe('View ▸ Zoom');
  });
});
