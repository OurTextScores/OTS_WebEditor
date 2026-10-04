import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildShellOwnCommands } from '../../components/shell/shellCommands';
import {
  getHiddenSections,
  resetHiddenSectionsForTests,
} from '../../components/shell/toolbar/strip/stripPersistence';
import { STRIP_SECTIONS } from '../../components/shell/toolbar/strip/stripSections';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';

function setup() {
  const registry = new CommandRegistry();
  registry.setContextSource(() => ({ ...DEFAULT_COMMAND_CONTEXT }));
  registry.register('global', buildShellOwnCommands());
  const checked = (arg: string) =>
    registry.list().find((c) => c.id === 'view.toolbar.section')?.variants
      ? (
          registry.get('view.toolbar.section') as unknown as {
            checked: (ctx: unknown, a: string) => boolean;
          }
        ).checked({}, arg)
      : undefined;
  return { registry, checked };
}

beforeEach(() => {
  window.localStorage.clear();
  resetHiddenSectionsForTests();
});
afterEach(() => resetHiddenSectionsForTests());

describe('View ▸ Toolbar commands', () => {
  it('has a checked variant per section, all on to start', () => {
    const { registry, checked } = setup();
    const family = registry.list().find((c) => c.id === 'view.toolbar.section');
    expect(family?.variants?.map((v) => v.arg)).toEqual(STRIP_SECTIONS.map((s) => s.id));
    for (const section of STRIP_SECTIONS) expect(checked(section.id)).toBe(true);
  });

  it('a variant toggles its section, and Show All is only available once something is hidden', async () => {
    const { registry, checked } = setup();
    const showAll = () => registry.list().find((c) => c.id === 'view.toolbar.showAll')?.enabled;
    expect(showAll()).toBe(false);
    await registry.run('view.toolbar.section', 'notes');
    expect(checked('notes')).toBe(false);
    expect(getHiddenSections()).toEqual(['notes']);
    expect(showAll()).toBe(true);
    await registry.run('view.toolbar.showAll');
    expect(getHiddenSections()).toEqual([]);
    expect(checked('notes')).toBe(true);
  });
});
