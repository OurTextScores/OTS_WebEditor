import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RIBBON_MIGRATION, resolveLegacyTestId } from '../../components/shell/ribbonMigration';
import { COMMAND_FORMS } from '../../components/shell/commandForms';
import {
  flattenControls,
  STRIP_GROUPS,
  type StripItem,
} from '../../components/shell/toolbar/strip/toolbarLayout';
import { isCommandFamily, type CommandFamily } from '../../lib/commands/types';
import { allCommandsRegistry } from '../helpers/all-commands';

const REPO = resolve(__dirname, '../..');

/** Test ids the ribbon never had: its Open and SoundFont controls were hidden file inputs inside labels. */
const NEW_IDS = new Set([
  'btn-open-score',
  'btn-load-soundfont',
  'dropdown-fermata',
  'dropdown-breath',
  'btn-tempo-open',
  // Layout group: the ribbon's bar and signature inputs had a submit button but no opener.
  'btn-measures-open',
  'btn-pickup-open',
  'btn-timesig-custom-open',
]);

const entries = flattenControls(STRIP_GROUPS).flatMap((control) =>
  control.kind === 'menu'
    ? [
        {
          id: control.testId,
          commandId: control.commandId,
          arg: undefined as unknown,
          owner: control.testId,
        },
        ...control.items.map((item: StripItem) => ({
          id: item.testId,
          commandId: item.commandId ?? control.commandId,
          arg: item.arg,
          owner: control.testId,
          form: Boolean(item.opensForm),
        })),
      ]
    : [
        {
          id: control.testId,
          commandId: control.commandId,
          arg: 'arg' in control ? control.arg : undefined,
          owner: control.testId,
          form: control.kind === 'form',
        },
      ],
);

describe('the tool strip layout', () => {
  it('has no test id twice', () => {
    const ids = entries.map((entry) => entry.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it('names only commands that exist, with arguments that are real variants of their family', () => {
    const registry = allCommandsRegistry();
    for (const entry of entries) {
      if (!entry.commandId) continue; // a menu trigger: its items name the commands
      const command = registry.get(entry.commandId);
      expect(command, `${entry.id} -> ${entry.commandId}`).toBeDefined();
      if (command && isCommandFamily(command) && entry.arg !== undefined) {
        const variants = (command as unknown as CommandFamily<unknown>).variants.map((v) => v.arg);
        expect(variants, `${entry.id} arg`).toContainEqual(entry.arg);
      }
    }
  });

  it('keeps the ribbon’s ids on the ribbon’s commands', () => {
    for (const entry of entries) {
      if (NEW_IDS.has(entry.id) || !entry.commandId) continue;
      const legacy = resolveLegacyTestId(entry.id);
      expect(legacy, `${entry.id} is not a ribbon id`).toBeDefined();
      if (legacy?.entry.kind === 'container' || legacy?.entry.kind === 'input') continue;
      expect(legacy?.entry.commandId, entry.id).toBe(entry.commandId);
    }
  });

  it('gives every ribbon variant id the argument the ribbon gave it (btn-ottava-2 is variant 2)', () => {
    const wrong: string[] = [];
    for (const entry of entries) {
      if (NEW_IDS.has(entry.id) || entry.arg === undefined) continue;
      const legacy = resolveLegacyTestId(entry.id);
      if (!legacy?.entry.argFromSuffix) continue;
      if (legacy.arg !== entry.arg)
        wrong.push(
          `${entry.id}: ribbon says ${String(legacy.arg)}, strip passes ${String(entry.arg)}`,
        );
    }
    expect(wrong).toEqual([]);
  });

  it('does not reuse an id another component already renders (a test id must be on screen once)', () => {
    const own = join(REPO, 'components/shell/toolbar/strip');
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (path.startsWith(own) || name === 'node_modules') continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx$/.test(name)) sources.push(readFileSync(path, 'utf8'));
      }
    };
    walk(join(REPO, 'components'));
    const text = sources.join('\n');
    const clashes = entries
      .map((entry) => entry.id)
      .filter((id) => new RegExp(`['"\`]${id}['"\`]`).test(text));
    expect(clashes).toEqual([]);
  });

  it('only gives the strip controls whose commands the editor has, so a menu always has the same entry', () => {
    // Every strip command is reachable from the registry the menus and the palette read.
    const registry = allCommandsRegistry();
    const missing = entries
      .filter((entry) => entry.commandId && !registry.get(entry.commandId))
      .map((entry) => entry.id);
    expect(missing).toEqual([]);
    // And the argument forms are not bypassed: a command that needs a form is not run bare from a strip.
    for (const entry of entries) {
      if (entry.commandId && entry.arg === undefined && !('form' in entry && entry.form)) {
        expect(COMMAND_FORMS[entry.commandId], `${entry.id} needs a form`).toBeUndefined();
      }
    }
  });
});

/**
 * The requirement (SHELL_REDESIGN_DESIGN §23): every control the ribbon had is a button somewhere on
 * screen as well as in the menus. This reads the ribbon manifest, so a control cannot be forgotten.
 * Sections are added here as their groups ship.
 */
describe('ribbon parity for the shipped groups', () => {
  const SHIPPED_SECTIONS = [
    'File',
    'Edit',
    'View',
    'Help',
    'Notes',
    'Duration',
    'Pitch',
    'Expression',
    'Layout',
    'Bars',
    'Signatures',
  ];
  /** The open-the-palette footers of the shipped menus (they sit in the ribbon's Score section). */
  const SHIPPED_FOOTERS = new Set([
    'btn-open-dynamics-palette',
    'btn-open-ottava-palette',
    'btn-open-tremolo-palette',
    'btn-open-fermata-palette',
    'btn-open-breath-palette',
  ]);
  const shipped = (entry: { legacyLocation: string; legacyTestId: string; commandId?: string }) => {
    if (SHIPPED_FOOTERS.has(entry.legacyTestId)) return true;
    const section = entry.legacyLocation.split('\u203A')[1]?.trim() ?? '';
    return entry.legacyLocation.startsWith('Ribbon') && SHIPPED_SECTIONS.includes(section);
  };
  /** Dropdown triggers whose items are direct buttons elsewhere (the quick row's voices, ties, durations). */
  const GROUP_HEADERS = new Set(['dropdown-voice', 'dropdown-slur-tie', 'dropdown-rhythm']);

  const renderedElsewhere = (() => {
    const own = join(REPO, 'components/shell/toolbar/strip');
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (path.startsWith(own) || name === 'node_modules') continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/ribbonMigration|menus|menuTree/.test(name)) {
          sources.push(readFileSync(path, 'utf8'));
        }
      }
    };
    walk(join(REPO, 'components'));
    return sources.join('\n');
  })();

  const onScreen = (id: string, prefix: boolean | undefined) => {
    const inStrip = entries.some((entry) => (prefix ? entry.id.startsWith(id) : entry.id === id));
    if (inStrip) return true;
    // A form button's own submit button lives in its popover.
    const submits = flattenControls(STRIP_GROUPS).some(
      (control) => control.kind === 'form' && COMMAND_FORMS[control.commandId]?.submitTestId === id,
    );
    if (submits) return true;
    const quote = ["'", '"', '`'];
    return quote.some((q) => renderedElsewhere.includes(prefix ? q + id : q + id + q));
  };

  it('has a button for every command the ribbon\u2019s shipped sections had', () => {
    const missing = RIBBON_MIGRATION.filter((entry) => {
      if (!shipped(entry)) return false;
      if ((entry.kind ?? 'command') !== 'command') return false;
      return !onScreen(entry.legacyTestId, entry.prefix);
    }).map((entry) => entry.legacyTestId);
    expect(missing).toEqual([]);
  });

  it('has a menu button for every dropdown the ribbon had in those sections', () => {
    const missing = RIBBON_MIGRATION.filter((entry) => {
      if (!shipped(entry)) return false;
      if (entry.kind !== 'container' || !entry.legacyTestId.startsWith('dropdown-')) return false;
      if (GROUP_HEADERS.has(entry.legacyTestId)) return false;
      return !onScreen(entry.legacyTestId, entry.prefix);
    }).map((entry) => entry.legacyTestId);
    expect(missing).toEqual([]);
  });
});

describe('split and grid menus in the layout', () => {
  const menus = flattenControls(STRIP_GROUPS).filter(
    (control): control is Extract<typeof control, { kind: 'menu' }> => control.kind === 'menu',
  );

  it('give every cell of a glyph grid a glyph (a grid of bare words is a list)', () => {
    for (const menu of menus.filter((candidate) => candidate.columns)) {
      const bare = menu.items.filter((item) => !item.glyph).map((item) => item.testId);
      expect(bare, menu.testId).toEqual([]);
    }
  });

  it('only split a family that is a grid of glyphs or short enough to choose from, and name its footer', () => {
    for (const menu of menus.filter((candidate) => candidate.split)) {
      expect(menu.columns, `${menu.testId} is a split button`).toBeGreaterThan(0);
      expect(menu.items.length, menu.testId).toBeGreaterThan(1);
    }
    for (const menu of menus.filter((candidate) => candidate.footer)) {
      expect(menu.footer?.commandId, menu.testId).toBe('view.palette.open');
      expect(typeof menu.footer?.arg, menu.testId).toBe('string');
    }
  });
});

describe('form buttons in the layout', () => {
  it('open a command that has a form, and nothing else does', () => {
    const forms = flattenControls(STRIP_GROUPS).filter((control) => control.kind === 'form');
    expect(forms.length).toBeGreaterThan(0);
    for (const control of forms) {
      expect(COMMAND_FORMS[control.commandId], control.testId).toBeDefined();
    }
  });
});

describe('menu items that open a form', () => {
  it('name a command that has a form (otherwise they would run it with no arguments)', () => {
    const flagged = flattenControls(STRIP_GROUPS).flatMap((control) =>
      control.kind === 'menu' ? control.items.filter((item) => item.opensForm) : [],
    );
    expect(flagged.length).toBeGreaterThan(0);
    for (const item of flagged) {
      expect(item.commandId && COMMAND_FORMS[item.commandId], item.testId).toBeDefined();
    }
  });
});
