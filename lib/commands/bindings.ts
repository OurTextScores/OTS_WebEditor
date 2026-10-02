import type { CommandId } from './types';

/**
 * The key bindings, as data (docs/private/COMMAND_REGISTRY_DESIGN_2026-10-02.md §2.1).
 *
 * One row per key. A binding names a command (or swallows the key) and says in which context
 * it is live. It holds no handler and no condition: whether the command may run is the
 * command's own `enabled`, so there is one gate per action. Because this module is plain
 * data, the router, the help dialog and page, the conflict test and the desktop-parity report
 * all read the same table.
 *
 * Grammar: `Mod+Shift+P`, `Alt+ArrowUp`, `Space`, `F7`, `.`. `Mod` is Ctrl, or ⌘ on macOS.
 * A shifted character is written as the physical key plus Shift (`Shift+=` for `+`), the way
 * MuseScore writes them. Letters are case-insensitive. Bindings assume a US key layout for
 * shifted punctuation; other layouts are a known limit, stated in the generated shortcut list.
 */

/**
 * Where a binding is live. The router activates, most specific first:
 * - `noteInput` / `normal`: the main score, with or without note input on;
 * - `edit`: both of those (editing keys that mean the same either way);
 * - `compare`: a compare session (own bindings arrive with W2.5);
 * - `global`: everywhere the shell is, including compare.
 */
export type KeyContext = 'global' | 'edit' | 'normal' | 'noteInput' | 'compare';

export interface Binding {
  readonly keys: string;
  /** Absent only for `swallow` bindings. */
  readonly commandId?: CommandId;
  readonly arg?: unknown;
  readonly context: KeyContext;
  /** Fires while a text field or an open overlay has focus (only the palette does). */
  readonly inTextFields?: boolean;
  /** Take the key even when the command is disabled, so the browser's own action never runs. */
  readonly swallowWhenDisabled?: boolean;
  /** Take the key and do nothing (arrows in note input would otherwise scroll the page). */
  readonly swallow?: boolean;
  /** MuseScore's action code (`shortcuts.xml`), for the parity report. */
  readonly desktop?: string;
}

export interface KeyCombo {
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly key: string;
}

const SHIFTED_TO_BASE: Record<string, string> = {
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  _: '-',
  '+': '=',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
  '~': '`',
};

const NAMED: Record<string, string> = {
  ' ': 'Space',
  space: 'Space',
  esc: 'Escape',
  escape: 'Escape',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  delete: 'Delete',
  backspace: 'Backspace',
  enter: 'Enter',
  tab: 'Tab',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

function normaliseKey(raw: string): string {
  const lower = raw.toLowerCase();
  if (NAMED[lower]) return NAMED[lower];
  if (/^f\d{1,2}$/.test(lower)) return lower.toUpperCase();
  return lower;
}

/** `Mod+Shift+=` -> its parts. Throws on a string with no key, so a typo fails at load. */
export function parseKeys(keys: string): KeyCombo {
  const parts = keys.split('+');
  // A literal '+' ends the string ('Mod++'), which split() turns into two empty trailing parts.
  let key = parts[parts.length - 1];
  let modifiers = parts.slice(0, -1);
  if (key === '' && parts.length >= 2) {
    key = '+';
    modifiers = parts.slice(0, -2);
  }
  const combo = { mod: false, shift: false, alt: false, key: normaliseKey(key) };
  for (const modifier of modifiers) {
    const lower = modifier.toLowerCase();
    if (lower === 'mod' || lower === 'ctrl' || lower === 'cmd') combo.mod = true;
    else if (lower === 'shift') combo.shift = true;
    else if (lower === 'alt' || lower === 'option') combo.alt = true;
    else throw new Error(`Unknown modifier "${modifier}" in "${keys}"`);
  }
  if (!combo.key) throw new Error(`Invalid key combination "${keys}"`);
  return combo;
}

/** What a keydown means, in the same shape as a binding, with shifted characters un-shifted. */
export function eventToCombo(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
): KeyCombo {
  let key = event.key;
  let shift = event.shiftKey;
  // '+' is the shifted '=' on a US keyboard; the numpad produces it with no Shift at all.
  if (key === '+') {
    key = '=';
    shift = true;
  } else if (event.shiftKey && SHIFTED_TO_BASE[key]) {
    key = SHIFTED_TO_BASE[key];
  }
  return {
    mod: event.ctrlKey || event.metaKey,
    shift,
    alt: event.altKey,
    key: normaliseKey(key),
  };
}

export const comboMatches = (a: KeyCombo, b: KeyCombo): boolean =>
  a.mod === b.mod && a.shift === b.shift && a.alt === b.alt && a.key === b.key;

export const slotOf = (combo: KeyCombo): string =>
  `${combo.mod ? 'M' : ''}${combo.shift ? 'S' : ''}${combo.alt ? 'A' : ''}:${combo.key}`;

/** Can one keypress reach both contexts? `global` is under everything; `edit` is under both modes. */
export function contextsOverlap(a: KeyContext, b: KeyContext): boolean {
  if (a === b || a === 'global' || b === 'global') return true;
  const modes: KeyContext[] = ['normal', 'noteInput'];
  return (a === 'edit' && modes.includes(b)) || (b === 'edit' && modes.includes(a));
}

/**
 * Keys a browser tab keeps for itself, so a page can neither capture nor reliably show them.
 * Reload, fullscreen, devtools, new/close tab and window, and tab switching. A desktop default
 * on one of these (New Score and Staff Text are Ctrl+N and Ctrl+T) is palette and menu only.
 */
export const RESERVED_SHORTCUTS: readonly string[] = [
  'F5',
  'F11',
  'F12',
  'Mod+N',
  'Mod+T',
  'Mod+W',
  'Mod+Shift+N',
  'Mod+Shift+T',
  'Mod+Shift+W',
  'Ctrl+Tab',
  'Mod+PageUp',
  'Mod+PageDown',
  // Ctrl/Cmd+1..9 switch tabs and cannot be intercepted (desktop uses Ctrl+2..9 for tuplets).
  ...Array.from({ length: 9 }, (_, index) => `Mod+${index + 1}`),
];

/**
 * Desktop defaults a browser or the OS acts on (focus the address bar, bookmark, reload, find
 * next …). Some engines let a page capture them and some do not, and a page cannot tell which
 * until a user loses a bookmark dialog. They stay unbound, palette and menu only, until each
 * is verified in the browsers OTS supports.
 */
export const BROWSER_OWNED_UNBOUND: readonly string[] = [
  'Mod+D',
  'Mod+E',
  'Mod+G',
  'Mod+J',
  'Mod+K',
  'Mod+L',
  'Mod+Q',
  'Mod+R',
];

/** Two bindings that one keypress could both reach. Empty means the table is sound. */
export function findConflicts(bindings: readonly Binding[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i < bindings.length; i += 1) {
    const a = bindings[i];
    for (let j = i + 1; j < bindings.length; j += 1) {
      const b = bindings[j];
      if (
        slotOf(parseKeys(a.keys)) === slotOf(parseKeys(b.keys)) &&
        contextsOverlap(a.context, b.context)
      ) {
        problems.push(`${a.keys} (${a.context}) and ${b.keys} (${b.context})`);
      }
    }
  }
  return problems;
}

const key = (
  keys: string,
  commandId: CommandId,
  context: KeyContext,
  extra: Partial<Binding> = {},
): Binding => ({ keys, commandId, context, ...extra });

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Digit -> the engine's duration type (1 = 64th … 8 = breve). */
const DURATION_BY_DIGIT: Record<string, number> = {
  '1': 8,
  '2': 7,
  '3': 6,
  '4': 5,
  '5': 4,
  '6': 3,
  '7': 2,
  '8': 1,
};

/**
 * Desktop MuseScore's defaults are the defaults here (`shortcuts.xml`), except where the
 * browser owns the key.
 */
export const BINDINGS: readonly Binding[] = [
  // ── Shell: live everywhere ────────────────────────────────────────────────────────
  key('Mod+Shift+P', 'shell.palette', 'global', { inTextFields: true }),
  key('Mod+F', 'view.goto.prompt', 'global', { swallowWhenDisabled: true }),
  key('F1', 'help.open', 'global', { desktop: 'help' }),
  key('F7', 'view.panel.instruments', 'global', { desktop: 'toggle-instruments' }),
  key('F8', 'view.panel.properties', 'global', { desktop: 'toggle-properties-panel' }),
  key('F9', 'view.panel.palettes', 'global', { desktop: 'toggle-palettes' }),
  key('Mod+\\', 'view.panels.toggle', 'global'),
  key('Mod+=', 'view.zoom.in', 'global', { desktop: 'zoomin' }),
  key('Mod+Shift+=', 'view.zoom.in', 'global', { desktop: 'zoomin' }),
  key('Mod+-', 'view.zoom.out', 'global', { desktop: 'zoomout' }),
  key('Mod+0', 'view.zoom.preset', 'global', { arg: 1, desktop: 'zoom100' }),
  key('Mod+S', 'checkpoint.save', 'global', { swallowWhenDisabled: true, desktop: 'file-save' }),
  key('Mod+O', 'file.open', 'global', { swallowWhenDisabled: true, desktop: 'file-open' }),
  key('Mod+P', 'file.export.pdf', 'global', { swallowWhenDisabled: true, desktop: 'print' }),
  key('Escape', 'shell.escape', 'global', { desktop: 'cancel' }),
  key('Space', 'playback.playPause', 'global', { desktop: 'play' }),
  key('Shift+Space', 'playback.playFromSelection', 'global', { desktop: 'play-from-selection' }),

  // ── Editing keys, in the main score with or without note input ───────────────────
  key('Mod+Z', 'edit.undo', 'edit', { swallowWhenDisabled: true, desktop: 'undo' }),
  key('Mod+Shift+Z', 'edit.redo', 'edit', { swallowWhenDisabled: true, desktop: 'redo' }),
  key('Mod+Y', 'edit.redo', 'edit', { swallowWhenDisabled: true, desktop: 'redo' }),
  key('Mod+A', 'edit.selectAll', 'edit', {
    swallowWhenDisabled: true,
    desktop: 'notation-select-all',
  }),
  key('Mod+C', 'edit.copy', 'edit', { swallowWhenDisabled: true, desktop: 'action://copy' }),
  key('Mod+V', 'edit.paste', 'edit', { swallowWhenDisabled: true, desktop: 'action://paste' }),
  key('N', 'add.noteInput', 'edit', { desktop: 'note-input-by-note-name' }),
  ...LETTERS.flatMap((letter, step) => [
    key(letter, 'add.note.step', 'edit', {
      arg: { step, chord: false },
      desktop: `note-${letter.toLowerCase()}`,
    }),
    key(`Shift+${letter}`, 'add.note.step', 'edit', {
      arg: { step, chord: true },
      desktop: `chord-${letter.toLowerCase()}`,
    }),
  ]),
  key('0', 'add.rest', 'edit', { desktop: 'rest' }),
  ...Object.entries(DURATION_BY_DIGIT).map(([digit, duration]) =>
    key(digit, 'edit.duration.set', 'edit', { arg: duration }),
  ),
  key('.', 'edit.duration.dot', 'edit', { desktop: 'pad-dot' }),
  key('Shift+=', 'add.accidental', 'edit', { arg: 3, desktop: 'sharp' }),
  key('-', 'add.accidental', 'edit', { arg: 1, desktop: 'flat' }),
  key('=', 'add.accidental', 'edit', { arg: 2, desktop: 'nat' }),
  key('T', 'add.line.tie', 'edit', { desktop: 'tie' }),
  key('X', 'format.flip', 'edit', { desktop: 'flip' }),
  key('ArrowRight', 'edit.select.nextChord', 'edit', { desktop: 'notation-move-right' }),
  key('ArrowLeft', 'edit.select.prevChord', 'edit', { desktop: 'notation-move-left' }),
  key('Shift+ArrowRight', 'edit.select.extendNextChord', 'edit', { desktop: 'select-next-chord' }),
  key('Shift+ArrowLeft', 'edit.select.extendPrevChord', 'edit', { desktop: 'select-prev-chord' }),
  key('Mod+Shift+ArrowRight', 'edit.select.extendNextMeasure', 'edit', {
    desktop: 'select-next-measure',
  }),
  key('Mod+Shift+ArrowLeft', 'edit.select.extendPrevMeasure', 'edit', {
    desktop: 'select-prev-measure',
  }),
  key('Delete', 'edit.delete', 'edit', { desktop: 'action://delete' }),
  key('Backspace', 'edit.delete', 'edit', { desktop: 'action://delete' }),

  // Articulations, hairpins and layout (desktop: add-staccato, add-hairpin, system-break, …).
  key('Shift+S', 'add.mark.articulation', 'edit', {
    arg: 'articStaccatoAbove',
    desktop: 'add-staccato',
  }),
  key('Shift+N', 'add.mark.articulation', 'edit', {
    arg: 'articTenutoAbove',
    desktop: 'add-tenuto',
  }),
  key('Shift+O', 'add.mark.articulation', 'edit', {
    arg: 'articMarcatoAbove',
    desktop: 'add-marcato',
  }),
  key('Shift+,', 'add.line.hairpin', 'edit', { arg: 0, desktop: 'add-hairpin' }),
  key('Shift+.', 'add.line.hairpin', 'edit', { arg: 1, desktop: 'add-hairpin-reverse' }),
  ...[0, 1, 2, 3].map((voice) =>
    key(`Mod+Alt+${voice + 1}`, 'tools.voice', 'edit', {
      arg: voice,
      desktop: `voice-${voice + 1}`,
    }),
  ),
  key('Mod+B', 'add.measures', 'edit', {
    arg: { count: 1, target: 'end' },
    desktop: 'append-measure',
  }),

  // ── Normal mode only ──────────────────────────────────────────────────────────────
  key('S', 'add.line.slur', 'normal', { desktop: 'add-slur' }),
  key('W', 'edit.duration.longer', 'normal', { desktop: 'double-duration' }),
  key('Q', 'edit.duration.shorter', 'normal', { desktop: 'half-duration' }),
  key('Enter', 'format.break.line', 'normal', { desktop: 'system-break' }),
  key('Mod+Enter', 'format.break.page', 'normal', { desktop: 'page-break' }),
  key('ArrowUp', 'edit.pitch.up', 'normal', { desktop: 'pitch-up' }),
  key('ArrowDown', 'edit.pitch.down', 'normal', { desktop: 'pitch-down' }),
  key('Mod+ArrowUp', 'edit.pitch.octaveUp', 'normal', { desktop: 'pitch-up-octave' }),
  key('Mod+ArrowDown', 'edit.pitch.octaveDown', 'normal', { desktop: 'pitch-down-octave' }),
  key('Shift+ArrowUp', 'edit.select.extendStaffAbove', 'normal', { desktop: 'select-staff-above' }),
  key('Shift+ArrowDown', 'edit.select.extendStaffBelow', 'normal', {
    desktop: 'select-staff-below',
  }),

  // ── Note input: the up and down arrows belong to the cursor, not the page ─────────
  ...[
    'ArrowUp',
    'ArrowDown',
    'Mod+ArrowUp',
    'Mod+ArrowDown',
    'Shift+ArrowUp',
    'Shift+ArrowDown',
  ].map((keys): Binding => ({ keys, context: 'noteInput', swallow: true })),
];

/** Maps a desktop duration digit to its engine type, exported for the generated shortcut list. */
export const DURATION_TYPE_BY_DIGIT = DURATION_BY_DIGIT;

/**
 * The key to show for a command (or one family variant): the first binding for it, in table
 * order. `arg` is compared structurally, so `{ step: 0, chord: false }` finds the `C` binding.
 */
export function primaryShortcut(commandId: CommandId, arg?: unknown): string | undefined {
  const matches = (binding: Binding) =>
    binding.commandId === commandId &&
    (arg === undefined
      ? binding.arg === undefined
      : JSON.stringify(binding.arg) === JSON.stringify(arg));
  return BINDINGS.find(matches)?.keys;
}
