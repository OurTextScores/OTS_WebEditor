import type { CommandId } from '../../lib/commands/types';

/**
 * Where every legacy ribbon and chrome control went (SHELL_REDESIGN_DESIGN §9, principle P7:
 * nothing disappears silently).
 *
 * This is the single source of truth for three consumers:
 *   - `unit/shell/ribbon-migration.test.ts` fails when a control has no entry, or an
 *     entry names a command that is not registered;
 *   - `tests/helpers/commands.ts` resolves a legacy `data-testid` to a command, so
 *     end-to-end specs keep working wherever the control now lives;
 *   - the Phase 5 walkthrough, which checks each entry by hand.
 *
 * Deliberately plain data with no React or DOM imports, so Playwright can load it.
 */

export type MigrationKind =
  /** The control runs a command (`commandId`, optionally with `arg`). */
  | 'command'
  /** A dropdown trigger or menu panel; its items are the entries, it becomes a menu path. */
  | 'container'
  /** A glyph inside an item; it moves with the item and has no behaviour of its own. */
  | 'decoration'
  /** A form field feeding `commandId`'s arguments. */
  | 'input'
  /** Chrome that is not a command (panels, strips, indicators). */
  | 'chrome';

export interface MigrationEntry {
  /** An exact `data-testid`, or a prefix when `prefix` is true (template literals). */
  readonly legacyTestId: string;
  readonly prefix?: boolean;
  readonly kind?: MigrationKind; // defaults to 'command'
  readonly legacyLocation: string; // 'Ribbon › File › Export'
  readonly commandId?: CommandId; // 'file.export.pdf'
  /** Fixed argument for the command (a family variant). */
  readonly arg?: unknown;
  /** Derives the argument from the part of the test id after the prefix. */
  readonly argFromSuffix?: (suffix: string) => unknown;
  readonly newHome: string; // 'File ▸ Export ▸ PDF'
  readonly alsoIn?: readonly string[]; // ['Palette', 'Mod+P']
  /**
   * The rollout phase (§10) by which `commandId` is registered and `newHome` exists. Defaults
   * to 0, and the coverage test enforces registration for every phase already shipped.
   * Chrome that belongs to later phases names the command it will become without
   * pretending it exists yet.
   */
  readonly phase?: number;
}

const number = (suffix: string) => Number(suffix);

const command = (
  legacyTestId: string,
  legacyLocation: string,
  commandId: CommandId,
  newHome: string,
  extra: Partial<MigrationEntry> = {},
): MigrationEntry => ({ legacyTestId, legacyLocation, commandId, newHome, ...extra });

/** A family variant addressed by a template test id: `btn-clef-${value}`. */
const variant = (
  prefix: string,
  legacyLocation: string,
  commandId: CommandId,
  newHome: string,
  argFromSuffix: (suffix: string) => unknown = number,
): MigrationEntry => ({
  legacyTestId: prefix,
  prefix: true,
  legacyLocation,
  commandId,
  newHome,
  argFromSuffix,
});

const container = (
  legacyTestId: string,
  legacyLocation: string,
  newHome: string,
): MigrationEntry => ({
  legacyTestId,
  kind: 'container',
  legacyLocation,
  newHome,
});

const decoration = (prefix: string, legacyLocation: string, newHome: string): MigrationEntry => ({
  legacyTestId: prefix,
  prefix: true,
  kind: 'decoration',
  legacyLocation,
  newHome,
});

const input = (
  legacyTestId: string,
  legacyLocation: string,
  commandId: CommandId,
  newHome: string,
): MigrationEntry => ({ legacyTestId, kind: 'input', legacyLocation, commandId, newHome });

const chrome = (
  legacyTestId: string,
  legacyLocation: string,
  newHome: string,
  extra: Partial<MigrationEntry> = {},
): MigrationEntry => ({ legacyTestId, kind: 'chrome', legacyLocation, newHome, ...extra });

const FILE = 'Ribbon › File';
const VIEW = 'Ribbon › View';
const PLAY = 'Ribbon › Playback';
const TEMPO = 'Ribbon › Tempo';
const BARS = 'Ribbon › Bars';
const SIGS = 'Ribbon › Signatures';
const SCORE = 'Ribbon › Score';
const NOTES = 'Ribbon › Notes';
const EXPR = 'Ribbon › Expression';
const EDIT = 'Ribbon › Edit';
const LAYOUT = 'Ribbon › Layout';
const PITCH = 'Ribbon › Pitch';
const DURATION = 'Ribbon › Duration';
const HELP = 'Ribbon › Help';

/** `btn-fretboard-${label.toLowerCase()}` -> the fret pattern the engine takes. */
const FRETBOARD_PATTERNS: Record<string, string> = {
  blank: '......',
  c: 'X32010',
  g: '320003',
  d: 'XX0232',
  a: 'X02220',
  e: '022100',
  am: 'X02210',
  em: '022000',
  dm: 'XX0231',
};

/** `btn-timesig-${numerator}-${denominator}`; the two presets below carry their glyph type. */
const timeSignature = (suffix: string) => {
  const [numerator, denominator] = suffix.split('-').map(Number);
  return { numerator, denominator };
};

export const RIBBON_MIGRATION: readonly MigrationEntry[] = [
  // ── File ──────────────────────────────────────────────────────────────────────────
  command('btn-new-score', FILE, 'file.new', 'File ▸ New Score…'),
  { ...input('open-score-input', FILE, 'file.open', 'File ▸ Open…'), alsoIn: ['Mod+O'] },
  command('btn-load-scores-to-compare', FILE, 'compare.load', 'File ▸ Compare Scores…'),
  container('dropdown-export', `${FILE} › Export`, 'File ▸ Export ▸'),
  command(
    'btn-export-mscz',
    `${FILE} › Export`,
    'file.export.mscz',
    'File ▸ Export ▸ MuseScore (.mscz)',
  ),
  command('btn-export-pdf', `${FILE} › Export`, 'file.export.pdf', 'File ▸ Export ▸ PDF', {
    alsoIn: ['Mod+P'],
  }),
  command('btn-export-svg', `${FILE} › Export`, 'file.export.svg', 'File ▸ Export ▸ SVG'),
  command('btn-export-png', `${FILE} › Export`, 'file.export.png', 'File ▸ Export ▸ PNG…'),
  command(
    'btn-export-mscx',
    `${FILE} › Export`,
    'file.export.mscx',
    'File ▸ Export ▸ MuseScore uncompressed (.mscx)',
  ),
  command(
    'btn-export-musicxml',
    `${FILE} › Export`,
    'file.export.musicxml',
    'File ▸ Export ▸ MusicXML',
  ),
  command(
    'btn-export-mxl',
    `${FILE} › Export`,
    'file.export.mxl',
    'File ▸ Export ▸ Compressed MusicXML (.mxl)',
  ),
  command('btn-export-abc', `${FILE} › Export`, 'file.export.abc', 'File ▸ Export ▸ ABC'),
  command('btn-export-midi', `${FILE} › Export`, 'file.export.midi', 'File ▸ Export ▸ MIDI'),
  command(
    'btn-export-audio',
    `${FILE} › Export`,
    'file.export.audio',
    'File ▸ Export ▸ Audio (WAV)',
  ),
  command(
    'btn-export-current-page-audio',
    `${FILE} › Export`,
    'file.export.pageAudio',
    'File ▸ Export ▸ Current Page Audio',
  ),
  command('btn-export-google-drive', FILE, 'file.drive.upload', 'File ▸ Upload to Google Drive…'),
  command('btn-create-share-link', FILE, 'file.shareLink', 'File ▸ Create Share Link…'),
  { ...input('soundfont-input', FILE, 'playback.soundfont', 'Tools ▸ Playback ▸ Load SoundFont…') },

  // ── View ──────────────────────────────────────────────────────────────────────────
  command('btn-fit-width', VIEW, 'view.zoom.fitWidth', 'View ▸ Zoom ▸ Fit Width', {
    alsoIn: ['Status bar'],
  }),
  command('btn-fit-height', VIEW, 'view.zoom.fitHeight', 'View ▸ Zoom ▸ Fit Height', {
    alsoIn: ['Status bar'],
  }),
  command('btn-zoom-out', VIEW, 'view.zoom.out', 'View ▸ Zoom Out', {
    alsoIn: ['Mod+-', 'Status bar'],
  }),
  command('btn-zoom-in', VIEW, 'view.zoom.in', 'View ▸ Zoom In', {
    alsoIn: ['Mod+=', 'Status bar'],
  }),
  chrome('zoom-preset-trigger', `${VIEW} › zoom %`, 'Status bar ▸ zoom preset ▾ (test id kept)', {
    commandId: 'view.zoom.preset',
  }),
  command(
    'zoom-preset-fit-width',
    `${VIEW} › zoom %`,
    'view.zoom.fitWidth',
    'View ▸ Zoom ▸ Fit Width',
  ),
  command(
    'zoom-preset-fit-height',
    `${VIEW} › zoom %`,
    'view.zoom.fitHeight',
    'View ▸ Zoom ▸ Fit Height',
  ),
  variant(
    'zoom-preset-',
    `${VIEW} › zoom %`,
    'view.zoom.preset',
    'View ▸ Zoom ▸ 25% … 100%',
    (suffix) => Number(suffix) / 100,
  ),
  command('btn-toggle-palettes', VIEW, 'view.panel.palettes', 'View ▸ Palettes', {
    alsoIn: ['F9'],
  }),
  command('btn-toggle-panels', VIEW, 'view.panels.toggle', 'View ▸ Toggle All Panels', {
    alsoIn: ['Mod+\\'],
  }),

  // ── Playback ──────────────────────────────────────────────────────────────────────
  command('btn-play', PLAY, 'playback.playPause', 'Header transport'),
  command('btn-stop', PLAY, 'playback.stop', 'Header transport'),
  command('btn-play-from-selection', PLAY, 'playback.playFromSelection', 'Header transport'),

  // ── Tempo ─────────────────────────────────────────────────────────────────────────
  input('input-tempo-bpm', TEMPO, 'add.text.tempo', 'Add ▸ Text ▸ Tempo… (popover)'),
  command('btn-tempo-apply', TEMPO, 'add.text.tempo', 'Add ▸ Text ▸ Tempo… (popover)'),

  // ── Bars ──────────────────────────────────────────────────────────────────────────
  input('input-measure-count', BARS, 'add.measures', 'Add ▸ Measures ▸ Insert Measures…'),
  input('select-measure-target', BARS, 'add.measures', 'Add ▸ Measures ▸ Insert Measures…'),
  command('btn-insert-measures', BARS, 'add.measures', 'Add ▸ Measures ▸ Insert Measures…'),
  input('input-pickup-numerator', BARS, 'add.pickup', 'Add ▸ Measures ▸ Add Pickup…'),
  input('select-pickup-denominator', BARS, 'add.pickup', 'Add ▸ Measures ▸ Add Pickup…'),
  command('btn-add-pickup', BARS, 'add.pickup', 'Add ▸ Measures ▸ Add Pickup…'),
  command(
    'btn-remove-containing-measures',
    BARS,
    'tools.measures.removeSelected',
    'Tools ▸ Measures ▸ Remove Selected Measures',
  ),
  command(
    'btn-remove-trailing-empty',
    BARS,
    'tools.measures.removeTrailingEmpty',
    'Tools ▸ Measures ▸ Remove Empty Trailing Measures',
  ),

  // ── Signatures ────────────────────────────────────────────────────────────────────
  container('dropdown-signature', SIGS, 'Add ▸ Signatures ▸ Time ▸'),
  command(
    'btn-timesig-4-4',
    `${SIGS} › Time`,
    'add.timeSig',
    'Add ▸ Signatures ▸ Time ▸ Common time',
    {
      arg: { numerator: 4, denominator: 4, timeSigType: 1 },
    },
  ),
  command(
    'btn-timesig-2-2',
    `${SIGS} › Time`,
    'add.timeSig',
    'Add ▸ Signatures ▸ Time ▸ Cut time',
    {
      arg: { numerator: 2, denominator: 2, timeSigType: 2 },
    },
  ),
  variant(
    'btn-timesig-',
    `${SIGS} › Time`,
    'add.timeSig',
    'Add ▸ Signatures ▸ Time ▸',
    timeSignature,
  ),
  input('input-timesig-numerator', SIGS, 'add.timeSig.custom', 'Add ▸ Signatures ▸ Time ▸ Custom…'),
  input(
    'input-timesig-denominator',
    SIGS,
    'add.timeSig.custom',
    'Add ▸ Signatures ▸ Time ▸ Custom…',
  ),
  command('btn-timesig-custom', SIGS, 'add.timeSig.custom', 'Add ▸ Signatures ▸ Time ▸ Custom…'),
  container('dropdown-key', SIGS, 'Add ▸ Signatures ▸ Key ▸'),
  variant('btn-keysig-', `${SIGS} › Key`, 'add.keySig', 'Add ▸ Signatures ▸ Key ▸'),

  // ── Score ─────────────────────────────────────────────────────────────────────────
  container('dropdown-instruments', SCORE, 'View ▸ Instruments (F7)'),
  input(
    'select-instrument-add',
    `${SCORE} › Instruments`,
    'instruments.add',
    'Instruments panel ▸ Add',
  ),
  variant(
    'btn-part-visible-',
    `${SCORE} › Instruments`,
    'instruments.part.toggleVisible',
    'Instruments panel ▸ part ▸ Show/Hide',
    (suffix) => ({ index: Number(suffix) }),
  ),
  variant(
    'btn-part-remove-',
    `${SCORE} › Instruments`,
    'instruments.part.remove',
    'Instruments panel ▸ part ▸ Remove',
    (suffix) => ({ index: Number(suffix) }),
  ),
  container('dropdown-clef', SCORE, 'Add ▸ Signatures ▸ Clef ▸'),
  container('clef-menu', SCORE, 'Add ▸ Signatures ▸ Clef ▸'),
  variant('btn-clef-', `${SCORE} › Clef`, 'add.clef', 'Add ▸ Signatures ▸ Clef ▸'),
  decoration('clef-symbol-', `${SCORE} › Clef`, 'Add ▸ Signatures ▸ Clef ▸ glyph'),
  container('dropdown-repeats', SCORE, 'Add ▸ Repeats & Jumps ▸'),
  container('repeats-menu', SCORE, 'Add ▸ Repeats & Jumps ▸'),
  command(
    'btn-repeat-start',
    `${SCORE} › Repeats`,
    'add.repeat.start',
    'Add ▸ Repeats & Jumps ▸ Start Repeat',
  ),
  command(
    'btn-repeat-end',
    `${SCORE} › Repeats`,
    'add.repeat.end',
    'Add ▸ Repeats & Jumps ▸ End Repeat',
  ),
  variant(
    'btn-repeat-count-',
    `${SCORE} › Repeats`,
    'add.repeat.count',
    'Add ▸ Repeats & Jumps ▸ Repeat Count ▸',
  ),
  variant(
    'btn-barline-',
    `${SCORE} › Repeats`,
    'add.barline',
    'Add ▸ Repeats & Jumps ▸ Barlines ▸',
  ),
  variant('btn-volta-', `${SCORE} › Repeats`, 'add.volta', 'Add ▸ Repeats & Jumps ▸ Voltas ▸'),
  container('dropdown-navigation', SCORE, 'Add ▸ Repeats & Jumps ▸ Markers / Jumps ▸'),
  container('navigation-menu', SCORE, 'Add ▸ Repeats & Jumps ▸ Markers / Jumps ▸'),
  variant(
    'btn-marker-',
    `${SCORE} › Navigation`,
    'add.marker',
    'Add ▸ Repeats & Jumps ▸ Markers ▸',
  ),
  decoration('marker-symbol-', `${SCORE} › Navigation`, 'Add ▸ Repeats & Jumps ▸ Markers ▸ glyph'),
  variant('btn-jump-', `${SCORE} › Navigation`, 'add.jump', 'Add ▸ Repeats & Jumps ▸ Jumps ▸'),
  ...(
    [
      ['btn-open-clef-palette', 'Clefs'],
      ['btn-open-markers-palette', 'Markers'],
      ['btn-open-jumps-palette', 'Jumps'],
      ['btn-open-dynamics-palette', 'Dynamics'],
      ['btn-open-ottava-palette', 'Ottavas'],
      ['btn-open-tremolo-palette', 'Tremolos'],
      ['btn-open-fermata-palette', 'Fermatas'],
      ['btn-open-breath-palette', 'Breaths'],
    ] as const
  ).map(([testId, category]) =>
    command(
      testId,
      `${SCORE} › ${category} menu footer`,
      'view.palette.open',
      `Palettes panel ▸ ${category}`,
      {
        arg: category,
        alsoIn: ['F9'],
      },
    ),
  ),

  // ── Notes ─────────────────────────────────────────────────────────────────────────
  command('btn-note-input', NOTES, 'add.noteInput', 'Add ▸ Notes ▸ Note Input', { alsoIn: ['N'] }),
  container('dropdown-note-input-method', NOTES, 'Add ▸ Notes ▸ Input Method ▸'),
  variant('btn-note-input-method-', NOTES, 'add.inputMethod', 'Add ▸ Notes ▸ Input Method ▸'),
  container('dropdown-fretboards', NOTES, 'Add ▸ Marks ▸ Fretboard Diagrams ▸'),
  container('fretboards-menu', NOTES, 'Add ▸ Marks ▸ Fretboard Diagrams ▸'),
  variant(
    'btn-fretboard-',
    `${NOTES} › Fretboards`,
    'add.mark.fretboard',
    'Add ▸ Marks ▸ Fretboard Diagrams ▸',
    (suffix) => FRETBOARD_PATTERNS[suffix],
  ),
  container('dropdown-beams', NOTES, 'Format ▸ Beams ▸'),
  variant('btn-beam-', `${NOTES} › Beams`, 'format.beam', 'Format ▸ Beams ▸'),
  container('dropdown-grace-notes', NOTES, 'Add ▸ Notes ▸ Grace Notes ▸'),
  command(
    'btn-grace-acciaccatura',
    `${NOTES} › Grace Notes`,
    'add.grace',
    'Add ▸ Notes ▸ Grace Notes ▸ Acciaccatura',
    { arg: 1 },
  ),
  command(
    'btn-grace-appoggiatura',
    `${NOTES} › Grace Notes`,
    'add.grace',
    'Add ▸ Notes ▸ Grace Notes ▸ Appoggiatura',
    { arg: 2 },
  ),
  command(
    'btn-grace-16',
    `${NOTES} › Grace Notes`,
    'add.grace',
    'Add ▸ Notes ▸ Grace Notes ▸ Grace 16th',
    { arg: 8 },
  ),
  command(
    'btn-grace-32',
    `${NOTES} › Grace Notes`,
    'add.grace',
    'Add ▸ Notes ▸ Grace Notes ▸ Grace 32nd',
    { arg: 16 },
  ),
  command(
    'btn-grace-8-after',
    `${NOTES} › Grace Notes`,
    'add.grace',
    'Add ▸ Notes ▸ Grace Notes ▸ Grace 8th After',
    { arg: 32 },
  ),
  command(
    'btn-grace-16-after',
    `${NOTES} › Grace Notes`,
    'add.grace',
    'Add ▸ Notes ▸ Grace Notes ▸ Grace 16th After',
    { arg: 64 },
  ),
  command(
    'btn-grace-32-after',
    `${NOTES} › Grace Notes`,
    'add.grace',
    'Add ▸ Notes ▸ Grace Notes ▸ Grace 32nd After',
    { arg: 128 },
  ),
  decoration('grace-symbol-', `${NOTES} › Grace Notes`, 'Add ▸ Notes ▸ Grace Notes ▸ glyph'),
  container('dropdown-voice', NOTES, 'Tools ▸ Voices ▸'),
  {
    ...variant(
      'btn-voice-',
      `${NOTES} › Voice`,
      'tools.voice',
      'Tools ▸ Voices ▸',
      (suffix) => Number(suffix) - 1,
    ),
    alsoIn: ['Write toolbar ▸ V1–V4'],
  },
  container('dropdown-slur-tie', NOTES, 'Add ▸ Lines ▸'),
  command('btn-slur', `${NOTES} › Slur/Tie`, 'add.line.slur', 'Add ▸ Lines ▸ Slur', {
    alsoIn: ['S', 'Write toolbar'],
  }),
  command('btn-tie', `${NOTES} › Slur/Tie`, 'add.line.tie', 'Add ▸ Lines ▸ Tie', {
    alsoIn: ['Write toolbar'],
  }),
  command('btn-flip-stem', NOTES, 'format.flip', 'Format ▸ Flip Direction', { alsoIn: ['X'] }),
  container('dropdown-lines', NOTES, 'Add ▸ Lines ▸'),
  container('lines-menu', NOTES, 'Add ▸ Lines ▸'),
  variant('btn-ottava-', `${NOTES} › Lines`, 'add.line.ottava', 'Add ▸ Lines ▸ Ottava ▸'),
  decoration('ottava-symbol-', `${NOTES} › Lines`, 'Add ▸ Lines ▸ Ottava ▸ glyph'),
  variant('btn-trill-', `${NOTES} › Lines`, 'add.line.trill', 'Add ▸ Lines ▸ Trills ▸'),
  decoration('trill-symbol-', `${NOTES} › Lines`, 'Add ▸ Lines ▸ Trills ▸ glyph'),
  variant('btn-glissando-', `${NOTES} › Lines`, 'add.line.glissando', 'Add ▸ Lines ▸ Glissandos ▸'),
  decoration('glissando-symbol-', `${NOTES} › Lines`, 'Add ▸ Lines ▸ Glissandos ▸ glyph'),
  container('dropdown-chord', NOTES, 'Add ▸ Marks ▸ Arpeggios / Tremolos ▸'),
  container('chord-menu', NOTES, 'Add ▸ Marks ▸ Arpeggios / Tremolos ▸'),
  variant('btn-arpeggio-', `${NOTES} › Chord`, 'add.mark.arpeggio', 'Add ▸ Marks ▸ Arpeggios ▸'),
  decoration('arpeggio-symbol-', `${NOTES} › Chord`, 'Add ▸ Marks ▸ Arpeggios ▸ glyph'),
  variant('btn-tremolo-', `${NOTES} › Chord`, 'add.mark.tremolo', 'Add ▸ Marks ▸ Tremolos ▸'),
  decoration('tremolo-symbol-', `${NOTES} › Chord`, 'Add ▸ Marks ▸ Tremolos ▸ glyph'),

  // ── Expression ────────────────────────────────────────────────────────────────────
  container('dropdown-markings', EXPR, 'Add ▸ Marks ▸ Dynamics ▸'),
  container('markings-menu', EXPR, 'Add ▸ Marks ▸ Dynamics ▸'),
  variant('btn-dynamic-', `${EXPR} › Dynamics`, 'add.mark.dynamic', 'Add ▸ Marks ▸ Dynamics ▸'),
  decoration('dynamic-symbol-', `${EXPR} › Dynamics`, 'Add ▸ Marks ▸ Dynamics ▸ glyph'),
  container('dropdown-hairpins', EXPR, 'Add ▸ Lines ▸ Hairpins ▸'),
  command(
    'btn-hairpin-cresc',
    `${EXPR} › Hairpins`,
    'add.line.hairpin',
    'Add ▸ Lines ▸ Hairpins ▸ Crescendo',
    { arg: 0 },
  ),
  command(
    'btn-hairpin-decresc',
    `${EXPR} › Hairpins`,
    'add.line.hairpin',
    'Add ▸ Lines ▸ Hairpins ▸ Decrescendo',
    { arg: 1 },
  ),
  container('dropdown-pedal', EXPR, 'Add ▸ Lines ▸ Pedal ▸'),
  command(
    'btn-pedal-line',
    `${EXPR} › Pedal`,
    'add.line.pedal',
    'Add ▸ Lines ▸ Pedal ▸ Pedal Line',
    { arg: 0 },
  ),
  command('btn-pedal-text', `${EXPR} › Pedal`, 'add.line.pedal', 'Add ▸ Lines ▸ Pedal ▸ Ped. *', {
    arg: 1,
  }),
  command(
    'btn-pedal-sostenuto',
    `${EXPR} › Pedal`,
    'add.line.pedal.sostenuto',
    'Add ▸ Lines ▸ Pedal ▸ Sostenuto Pedal',
  ),
  command(
    'btn-pedal-una-corda',
    `${EXPR} › Pedal`,
    'add.line.pedal.unaCorda',
    'Add ▸ Lines ▸ Pedal ▸ Una Corda',
  ),
  command(
    'btn-pedal-split',
    `${EXPR} › Pedal`,
    'add.line.pedal.split',
    'Add ▸ Lines ▸ Pedal ▸ Pedal Change',
  ),
  container('dropdown-text', EXPR, 'Add ▸ Text ▸'),
  command('btn-text-title', `${EXPR} › Text`, 'add.text.title', 'Add ▸ Text ▸ Title…'),
  command('btn-text-subtitle', `${EXPR} › Text`, 'add.text.subtitle', 'Add ▸ Text ▸ Subtitle…'),
  command('btn-text-composer', `${EXPR} › Text`, 'add.text.composer', 'Add ▸ Text ▸ Composer…'),
  command('btn-text-lyricist', `${EXPR} › Text`, 'add.text.lyricist', 'Add ▸ Text ▸ Lyricist…'),
  command('btn-text-staff', `${EXPR} › Text`, 'add.text.staff', 'Add ▸ Text ▸ Staff Text'),
  command('btn-text-system', `${EXPR} › Text`, 'add.text.system', 'Add ▸ Text ▸ System Text'),
  command(
    'btn-text-expression',
    `${EXPR} › Text`,
    'add.text.expression',
    'Add ▸ Text ▸ Expression Text',
  ),
  command('btn-text-lyrics', `${EXPR} › Text`, 'add.text.lyrics', 'Add ▸ Text ▸ Lyrics'),
  command(
    'btn-text-harmony-standard',
    `${EXPR} › Text`,
    'add.text.harmony',
    'Add ▸ Text ▸ Chord Symbol',
    { arg: 0 },
  ),
  command(
    'btn-text-harmony-roman',
    `${EXPR} › Text`,
    'add.text.harmony',
    'Add ▸ Text ▸ Roman Numeral',
    { arg: 1 },
  ),
  command(
    'btn-text-harmony-nashville',
    `${EXPR} › Text`,
    'add.text.harmony',
    'Add ▸ Text ▸ Nashville Number',
    { arg: 2 },
  ),
  command(
    'btn-text-figured-bass',
    `${EXPR} › Text`,
    'add.text.figuredBass',
    'Add ▸ Text ▸ Figured Bass',
  ),
  command('btn-text-fingering', `${EXPR} › Text`, 'add.text.fingering', 'Add ▸ Text ▸ Fingering'),
  command(
    'btn-text-fingering-lh',
    `${EXPR} › Text`,
    'add.text.fingering.lh',
    'Add ▸ Text ▸ LH Guitar Fingering',
  ),
  command(
    'btn-text-fingering-rh',
    `${EXPR} › Text`,
    'add.text.fingering.rh',
    'Add ▸ Text ▸ RH Guitar Fingering',
  ),
  command(
    'btn-text-string-number',
    `${EXPR} › Text`,
    'add.text.stringNumber',
    'Add ▸ Text ▸ String Number',
  ),
  command('btn-text-sticking', `${EXPR} › Text`, 'add.text.sticking', 'Add ▸ Text ▸ Sticking'),
  command(
    'btn-text-instrument-change',
    `${EXPR} › Text`,
    'add.text.instrumentChange',
    'Add ▸ Text ▸ Instrument Change',
  ),
  container('dropdown-articulations', EXPR, 'Add ▸ Marks ▸ Articulations ▸'),
  container('articulations-menu', EXPR, 'Add ▸ Marks ▸ Articulations ▸'),
  variant(
    'btn-artic-',
    `${EXPR} › Articulations`,
    'add.mark.articulation',
    'Add ▸ Marks ▸ Articulations ▸',
    (suffix) => suffix,
  ),
  decoration('artic-symbol-', `${EXPR} › Articulations`, 'Add ▸ Marks ▸ Articulations ▸ glyph'),
  variant(
    'btn-fermata-',
    `${EXPR} › Articulations`,
    'add.mark.fermata',
    'Add ▸ Marks ▸ Fermatas ▸',
  ),
  decoration('fermata-symbol-', `${EXPR} › Articulations`, 'Add ▸ Marks ▸ Fermatas ▸ glyph'),
  variant(
    'btn-breath-',
    `${EXPR} › Articulations`,
    'add.mark.breath',
    'Add ▸ Marks ▸ Breaths & Caesuras ▸',
  ),
  decoration(
    'breath-symbol-',
    `${EXPR} › Articulations`,
    'Add ▸ Marks ▸ Breaths & Caesuras ▸ glyph',
  ),

  // ── Edit ──────────────────────────────────────────────────────────────────────────
  command('btn-select-all', EDIT, 'edit.selectAll', 'Edit ▸ Select All', { alsoIn: ['Mod+A'] }),
  container('dropdown-selection-filter', EDIT, 'Edit ▸ Selection Filter ▸'),
  container('selection-filter-menu', EDIT, 'Edit ▸ Selection Filter ▸'),
  variant(
    'selection-filter-',
    `${EDIT} › Selection Filter`,
    'edit.selectionFilter',
    'Edit ▸ Selection Filter ▸',
  ),
  command('btn-delete', EDIT, 'edit.delete', 'Edit ▸ Delete', { alsoIn: ['Delete'] }),
  command('btn-undo', EDIT, 'edit.undo', 'Edit ▸ Undo', { alsoIn: ['Mod+Z', 'Write toolbar'] }),
  command('btn-redo', EDIT, 'edit.redo', 'Edit ▸ Redo', { alsoIn: ['Mod+Y', 'Write toolbar'] }),

  // ── Layout ────────────────────────────────────────────────────────────────────────
  command('btn-new-line', LAYOUT, 'format.break.line', 'Format ▸ Breaks ▸ Line Break'),
  command('btn-new-page', LAYOUT, 'format.break.page', 'Format ▸ Breaks ▸ Page Break'),
  container('dropdown-bulk-tools', LAYOUT, 'Tools ▸'),
  command('btn-add-ambitus', `${LAYOUT} › Tools`, 'add.ambitus', 'Add ▸ Ambitus'),
  command('btn-explode-selection', `${LAYOUT} › Tools`, 'tools.explode', 'Tools ▸ Explode'),
  command('btn-implode-selection', `${LAYOUT} › Tools`, 'tools.implode', 'Tools ▸ Implode'),
  command('btn-regroup-selection', `${LAYOUT} › Tools`, 'tools.regroup', 'Tools ▸ Regroup Rhythms'),
  command(
    'btn-resequence-rehearsal',
    `${LAYOUT} › Tools`,
    'tools.resequence',
    'Tools ▸ Resequence Rehearsal Marks',
  ),

  // ── Pitch ─────────────────────────────────────────────────────────────────────────
  command('btn-pitch-down', PITCH, 'edit.pitch.down', 'Edit ▸ Pitch ▸ Down', {
    alsoIn: ['ArrowDown'],
  }),
  command('btn-pitch-up', PITCH, 'edit.pitch.up', 'Edit ▸ Pitch ▸ Up', { alsoIn: ['ArrowUp'] }),
  command('btn-transpose--12', PITCH, 'edit.pitch.octaveDown', 'Edit ▸ Pitch ▸ Down an Octave', {
    alsoIn: ['Mod+ArrowDown'],
  }),
  command('btn-transpose-12', PITCH, 'edit.pitch.octaveUp', 'Edit ▸ Pitch ▸ Up an Octave', {
    alsoIn: ['Mod+ArrowUp'],
  }),
  command('btn-transpose-dialog', PITCH, 'tools.transpose', 'Tools ▸ Transpose…'),
  container('dropdown-accidental', PITCH, 'Add ▸ Accidentals ▸'),
  variant('btn-acc-', `${PITCH} › Accidental`, 'add.accidental', 'Add ▸ Accidentals ▸'),
  decoration('acc-symbol-', `${PITCH} › Accidental`, 'Add ▸ Accidentals ▸ glyph'),

  // ── Duration ──────────────────────────────────────────────────────────────────────
  command('btn-duration-shorter', DURATION, 'edit.duration.shorter', 'Edit ▸ Duration ▸ Shorter'),
  command('btn-duration-longer', DURATION, 'edit.duration.longer', 'Edit ▸ Duration ▸ Longer'),
  container('dropdown-rhythm', DURATION, 'Edit ▸ Duration ▸'),
  command(
    'btn-duration-32',
    `${DURATION} › Rhythm`,
    'edit.duration.set',
    'Write toolbar ▸ Duration ▸ 32nd',
    { arg: 7, alsoIn: ['2'] },
  ),
  command(
    'btn-duration-16',
    `${DURATION} › Rhythm`,
    'edit.duration.set',
    'Write toolbar ▸ Duration ▸ 16th',
    { arg: 6, alsoIn: ['3'] },
  ),
  command(
    'btn-duration-8',
    `${DURATION} › Rhythm`,
    'edit.duration.set',
    'Write toolbar ▸ Duration ▸ 8th',
    { arg: 5, alsoIn: ['4'] },
  ),
  command(
    'btn-duration-4',
    `${DURATION} › Rhythm`,
    'edit.duration.set',
    'Write toolbar ▸ Duration ▸ Quarter',
    { arg: 4, alsoIn: ['5'] },
  ),
  command(
    'btn-duration-2',
    `${DURATION} › Rhythm`,
    'edit.duration.set',
    'Write toolbar ▸ Duration ▸ Half',
    { arg: 3, alsoIn: ['6'] },
  ),
  command(
    'btn-duration-1',
    `${DURATION} › Rhythm`,
    'edit.duration.set',
    'Write toolbar ▸ Duration ▸ Whole',
    { arg: 2, alsoIn: ['7'] },
  ),
  decoration('duration-symbol-', `${DURATION} › Rhythm`, 'Write toolbar ▸ Duration ▸ glyph'),
  command('btn-dot', `${DURATION} › Rhythm`, 'edit.duration.dot', 'Edit ▸ Duration ▸ Dot', {
    alsoIn: ['Write toolbar'],
  }),
  command(
    'btn-double-dot',
    `${DURATION} › Rhythm`,
    'edit.duration.doubleDot',
    'Edit ▸ Duration ▸ Double Dot',
    { alsoIn: ['Write toolbar'] },
  ),
  variant('btn-tuplet-', `${DURATION} › Rhythm`, 'add.tuplet', 'Add ▸ Tuplets ▸'),

  // ── Help ──────────────────────────────────────────────────────────────────────────
  chrome('dropdown-shortcuts', HELP, 'Help ▸ Keyboard Shortcuts', {
    commandId: 'help.shortcuts',
    phase: 1,
  }),
  command('link-help', HELP, 'help.open', 'Help ▸ Editor Help', { alsoIn: ['F1'] }),

  // ── Chrome outside the ribbon (§2.3, §9) ──────────────────────────────────────────
  chrome(
    'page-select',
    'Canvas header',
    'Status bar ▸ ‹ Page n / N › (test id kept on the trigger)',
    {
      commandId: 'view.goto.page',
      phase: 2,
    },
  ),
  chrome('page-indicator', 'Canvas header', 'Status bar ▸ ‹ Page n / N ›', { phase: 2 }),
  chrome('interaction-preparing-banner', 'Canvas', 'Status bar ▸ layout progress indicator', {
    phase: 2,
  }),
  chrome(
    'collapsed-panel-strip',
    'Right edge',
    'Removed: View menu, panel toggles, edge recovery handle',
    {
      phase: 3,
    },
  ),
  chrome('expand-panel-inspector', 'Collapsed panel strip', 'View ▸ Properties (F8)', {
    commandId: 'view.panel.properties',
    phase: 1,
  }),
  chrome('expand-panel-musicxml', 'Collapsed panel strip', 'View ▸ Score Source', {
    commandId: 'view.panel.scoreSource',
    phase: 1,
  }),
  chrome('expand-panel-ai-tools', 'Collapsed panel strip', 'View ▸ AI Tools', {
    commandId: 'view.panel.aiTools',
    phase: 1,
  }),
  chrome('expand-panel-history', 'Collapsed panel strip', 'Activity bar ▸ History', {
    commandId: 'shell.activity.history',
    phase: 4,
  }),
  {
    ...chrome('expand-panel-', 'Collapsed panel strip', 'See the four expand-panel-* entries', {
      phase: 3,
    }),
    prefix: true,
  },
  chrome(
    'btn-xml-toggle',
    'AI Tools sidebar',
    'AI Tools panel close button (test id kept); View ▸ AI Tools',
    {
      commandId: 'view.panel.aiTools',
      phase: 1,
    },
  ),
  chrome(
    'sidebar-resize-handle',
    'AI Tools sidebar',
    'AI Tools Panel resize handle (test id kept)',
    {
      phase: 3,
    },
  ),
  chrome('xml-sidebar', 'AI Tools sidebar', 'AI Tools panel (test id kept)', { phase: 3 }),
  ...(
    [
      ['tab-ai', 'assistant', 'Assistant'],
      ['tab-notagen', 'notagen', 'NotaGen'],
      ['tab-transcoda', 'transcoda', 'Transcoda OMR'],
      ['tab-multitrack-vae', 'multitrack', 'Multitrack'],
      ['tab-harmony', 'harmony', 'Harmony'],
      ['tab-functional-harmony', 'functional', 'Functional Harmony'],
      ['tab-mma', 'mma', 'Accompaniment (MMA)'],
    ] as const
  ).map(([testId, tool, label]) =>
    chrome(
      testId,
      'AI Tools tab strip',
      `AI Tools panel ▸ tool picker ▸ ${label}; Tools ▸ AI ▸ ${label}`,
      {
        commandId: `ai.open.${tool}`,
        phase: 1,
      },
    ),
  ),
  chrome('tab-versions', 'Left sidebar', 'History activity ▸ Versions', { phase: 4 }),
  chrome('tab-checkpoints', 'Left sidebar', 'History activity ▸ Checkpoints', { phase: 4 }),
  chrome('tab-scores', 'Left sidebar', 'History activity ▸ Scores; File ▸ Open Recent', {
    phase: 4,
  }),
  chrome('checkpoint-sidebar', 'Left sidebar', 'History left panel (test id kept)', { phase: 4 }),
  chrome('input-checkpoint-label', 'Left sidebar', 'History left panel (test id kept)', {
    phase: 4,
  }),
  chrome('checkpoint-compare-modal', 'Dialog', 'Compare activity (entered by state)', { phase: 4 }),
  chrome('generated-share-link', 'ShareLinkDialog', 'Unchanged (inside ShareLinkDialog)'),
];

/** A legacy test id resolved to what now owns it. */
export interface ResolvedLegacyTestId {
  readonly entry: MigrationEntry;
  readonly commandId?: CommandId;
  readonly arg?: unknown;
}

/**
 * Looks a legacy `data-testid` up: an exact entry wins, otherwise the longest matching
 * prefix entry, whose `argFromSuffix` derives the argument.
 */
export function resolveLegacyTestId(testId: string): ResolvedLegacyTestId | undefined {
  const exact = RIBBON_MIGRATION.find((entry) => !entry.prefix && entry.legacyTestId === testId);
  if (exact) return { entry: exact, commandId: exact.commandId, arg: exact.arg };

  let best: MigrationEntry | undefined;
  for (const entry of RIBBON_MIGRATION) {
    if (!entry.prefix || !testId.startsWith(entry.legacyTestId)) continue;
    if (!best || entry.legacyTestId.length > best.legacyTestId.length) best = entry;
  }
  if (!best) return undefined;
  const suffix = testId.slice(best.legacyTestId.length);
  return {
    entry: best,
    commandId: best.commandId,
    arg: best.argFromSuffix ? best.argFromSuffix(suffix) : best.arg,
  };
}
