import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BINDINGS, RESERVED_SHORTCUTS, parseKeys, slotOf } from '../../lib/commands/bindings';

/**
 * Desktop parity (docs/private/COMMAND_REGISTRY_DESIGN_2026-10-02.md §4.4): which of
 * MuseScore's default shortcuts (`shortcuts.xml`) the editor binds, which it does not, and
 * why. A report, not a gate: "unbound" is often right (TAB, braille, developer actions).
 *
 *   UPDATE_PARITY=1 npx vitest run unit/commands/shortcut-parity.test.ts
 *
 * regenerates docs/private/SHORTCUT_PARITY.md. The test itself checks the table's `desktop`
 * codes against the file, so a typo in one cannot hide an unbound action.
 */

const XML = resolve(
  process.env.MUSESCORE_SHORTCUTS ??
    '/home/jhlusko/workspace/MuseScore/src/app/configs/data/shortcuts.xml',
);
const REPORT = resolve(__dirname, '../../docs/private/SHORTCUT_PARITY.md');

interface Desktop {
  readonly section: string;
  readonly action: string;
  readonly seqs: readonly string[];
}

function readDesktop(): Desktop[] {
  const xml = readFileSync(XML, 'utf8');
  const out: Desktop[] = [];
  let section = '';
  for (const match of xml.matchAll(/<!--([\s\S]*?)-->|<SC>([\s\S]*?)<\/SC>/g)) {
    if (match[1] !== undefined) {
      section = match[1].trim().split('\n')[0].trim();
      continue;
    }
    const key = match[2].match(/<key>(.*?)<\/key>/)?.[1];
    if (!key) continue;
    out.push({
      section,
      action: key.replace(/^action:\/\//, ''),
      // The number pad's duplicates add nothing to a binding table keyed on the key pressed.
      seqs: [...match[2].matchAll(/<seq>(.*?)<\/seq>/g)]
        .map((seq) => seq[1])
        .filter((seq) => !seq.startsWith('Num+')),
    });
  }
  return out;
}

/** MuseScore's `Ctrl+Shift+Left` -> this table's grammar. */
const toGrammar = (seq: string) =>
  // A literal "+" key is Shift+= on the physical keyboard ("Ctrl++" is Ctrl+Shift+=).
  (seq === '+' ? 'Shift+=' : seq.endsWith('++') ? `${seq.slice(0, -2)}+Shift+=` : seq)
    .replace(/\bCtrl\b/g, 'Mod')
    .replace(/\bDel\b/g, 'Delete')
    .replace(/\bEsc\b/g, 'Escape')
    .replace(/\bLeft\b|\bRight\b|\bUp\b|\bDown\b/g, (d) => `Arrow${d}`)
    .replace(/\bPgUp\b/g, 'PageUp')
    .replace(/\bPgDown\b/g, 'PageDown');

const reservedSlots = new Set(RESERVED_SHORTCUTS.map((keys) => slotOf(parseKeys(keys))));

function classify(entry: Desktop): string {
  if (entry.action.startsWith('nav-') || entry.section.startsWith('NOTE special context'))
    return 'keyboard navigation of the desktop UI (browser focus handles this)';
  if (entry.section.startsWith('Dev')) return 'developer action';
  if (entry.section.startsWith('TAB')) return 'tablature';
  if (entry.section.startsWith('HARMONY')) return 'harmony / figured-bass text editing';
  const slots = entry.seqs.flatMap((seq) => {
    try {
      return [slotOf(parseKeys(toGrammar(seq)))];
    } catch {
      return [];
    }
  });
  if (slots.length > 0 && slots.every((slot) => reservedSlots.has(slot)))
    return 'browser-reserved: palette and menu only';
  return 'unbound';
}

const available = existsSync(XML);

describe.skipIf(!available)('desktop shortcut parity', () => {
  const desktop = readDesktop();
  const codes = new Set(desktop.map((entry) => entry.action));
  const code = (value: string | undefined) => value?.replace(/^action:\/\//, '');

  it('reads the desktop defaults', () => {
    expect(desktop.length).toBeGreaterThan(200);
  });

  it('only cites desktop actions that exist', () => {
    const unknown = BINDINGS.filter((b) => b.desktop && !codes.has(code(b.desktop)!)).map(
      (b) => `${b.keys} -> ${b.desktop}`,
    );
    expect(unknown).toEqual([]);
  });

  it('agrees with the desktop key where it cites an action', () => {
    const wrong: string[] = [];
    for (const binding of BINDINGS) {
      const entry = desktop.find((candidate) => candidate.action === code(binding.desktop));
      if (!entry) continue;
      const slot = slotOf(parseKeys(binding.keys));
      const desktopSlots = entry.seqs.flatMap((seq) => {
        try {
          return [slotOf(parseKeys(toGrammar(seq)))];
        } catch {
          return [];
        }
      });
      // Number-pad aliases and an empty default (undo is bound by the OS on desktop) are fine.
      if (desktopSlots.length > 0 && !desktopSlots.includes(slot)) {
        wrong.push(`${binding.keys} (${binding.desktop}: ${entry.seqs.join(', ')})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it.runIf(process.env.UPDATE_PARITY === '1')('writes the report', () => {
    const cited = new Set(BINDINGS.map((b) => code(b.desktop)).filter(Boolean));
    const groups = new Map<string, Desktop[]>();
    let bound = 0;
    for (const entry of desktop) {
      if (cited.has(entry.action)) {
        bound += 1;
        continue;
      }
      const why = classify(entry);
      groups.set(why, [...(groups.get(why) ?? []), entry]);
    }
    const lines = [
      '# Desktop shortcut parity',
      '',
      `Generated by \`unit/commands/shortcut-parity.test.ts\` from MuseScore's \`shortcuts.xml\` (${desktop.length} actions).`,
      `**${bound}** are bound here (cited by a \`desktop\` code in \`lib/commands/bindings.ts\`).`,
      '',
    ];
    for (const [why, entries] of [...groups.entries()].sort((a, b) =>
      a[0] === 'unbound' ? -1 : b[0] === 'unbound' ? 1 : a[0].localeCompare(b[0]),
    )) {
      lines.push(`## ${why} (${entries.length})`, '');
      for (const entry of entries) {
        lines.push(
          `- \`${entry.action}\` ${entry.seqs.map((seq) => `\`${seq}\``).join(' ') || '(no default)'}`,
        );
      }
      lines.push('');
    }
    writeFileSync(REPORT, lines.join('\n'));
  });
});
