import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLegacyTestId } from '../../components/shell/ribbonMigration';
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
const NEW_IDS = new Set(['btn-open-score', 'btn-load-soundfont']);

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
        })),
      ]
    : [
        {
          id: control.testId,
          commandId: control.commandId,
          arg: control.arg,
          owner: control.testId,
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
        expect(variants, `${entry.id} arg`).toContain(entry.arg);
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
      if (entry.commandId && entry.arg === undefined) {
        expect(COMMAND_FORMS[entry.commandId], `${entry.id} needs a form`).toBeUndefined();
      }
    }
  });
});
