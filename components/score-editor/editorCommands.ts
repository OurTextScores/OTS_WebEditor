import type { MeasureInsertTarget } from '../Toolbar';
import type { ToolbarSectionProps } from '../toolbar/types';
import {
  accidentalOptions,
  arpeggioOptions,
  articulationOptions,
  barlineOptions,
  beamOptions,
  breathOptions,
  clefButtonOptionsDefault,
  durationOptions,
  dynamicOptions,
  fermataOptions,
  fretDiagramOptions,
  getHelpHref,
  glissandoOptions,
  graceNoteOptions,
  hairpinOptions,
  jumpOptions,
  keySignatureButtonOptionsDefault,
  markerOptions,
  noteInputMethodOptions,
  ottavaOptions,
  paletteLinkOptions,
  pedalOptions,
  repeatCountOptions,
  selectionFilterOptions,
  signatureOptionsDefault,
  trillOptions,
  tremoloOptions,
  tupletOptions,
  voltaOptions,
  zoomPresets,
} from '../toolbar/constants';
import {
  defineCommand,
  defineFamily,
  type AnyCommand,
  type CommandContext,
  type CommandVariant,
} from '../../lib/commands/types';
import { confirmDialog } from '../shell/notices';

/**
 * Every ribbon action as a command (SHELL_REDESIGN_DESIGN Phase 0).
 *
 * These are thin adapters over the handlers `ScoreEditor` already passes the ribbon:
 * `run` calls the same function the ribbon button's `onClick` does, and `enabled` repeats
 * the ribbon's `disabled` rule, so a command can never do something its button would not.
 * Phase 1 moves the handler plumbing here from the `<Toolbar>` prop block; the command ids,
 * labels and legacy test ids are the contract that survives that move.
 *
 * `getProps` is read when a command runs or is evaluated, never captured, so a command
 * registered once always sees the latest handlers.
 */
type Props = ToolbarSectionProps;
type GetProps = () => Props;

/** Props that are a plain `() => void` action. */
type ActionKey = {
  [K in keyof Props]-?: NonNullable<Props[K]> extends () => void ? K : never;
}[keyof Props];

/** Props that take exactly one number. */
type NumberActionKey = {
  [K in keyof Props]-?: NonNullable<Props[K]> extends (value: number) => void
    ? ((value: number) => void) extends NonNullable<Props[K]>
      ? K
      : never
    : never;
}[keyof Props];

// Gates, mirroring the ribbon's `disabled` expressions.
type Gate = (ctx: CommandContext) => boolean;
const always: Gate = () => true;
const mutable: Gate = (ctx) => ctx.isMutable;
const withSelection: Gate = (ctx) => ctx.isMutable && ctx.selection !== 'none';
const withTarget: Gate = (ctx) => ctx.isMutable && (ctx.noteInput || ctx.selection !== 'none');
const withSelectionOutsideInput: Gate = (ctx) =>
  ctx.isMutable && ctx.selection !== 'none' && !ctx.noteInput;

const variants = <Source, Arg>(
  source: readonly Source[],
  map: (item: Source) => CommandVariant<Arg>,
): CommandVariant<Arg>[] => source.map(map);

const centre = () =>
  typeof window === 'undefined'
    ? { clientX: 0, clientY: 0 }
    : { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };

/** Opens the system file picker; resolves with the chosen file, or null if dismissed. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

const integer = (value: unknown, fallback: number, minimum = 1): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.floor(parsed)) : fallback;
};

export interface TimeSignatureArgs {
  readonly numerator: number;
  readonly denominator: number;
  readonly timeSigType?: number;
}

export function buildEditorCommands(getProps: GetProps): AnyCommand[] {
  const p = getProps;
  const has = (key: keyof Props) => Boolean(p()[key]);

  /** A command that calls one no-argument handler. */
  const action = (
    id: string,
    label: string,
    key: ActionKey,
    gate: Gate,
    extra: {
      testId?: string;
      shortcut?: string;
      keywords?: readonly string[];
      opensDialog?: boolean;
    } = {},
  ) =>
    defineCommand({
      id,
      label,
      ...extra,
      enabled: (ctx) => gate(ctx) && has(key),
      run: () => {
        (p()[key] as (() => void) | undefined)?.();
      },
    });

  /** A family whose variants call one handler with the variant's argument. */
  const numberFamily = <Source extends { value: number; label: string }>(
    id: string,
    label: string,
    key: NumberActionKey,
    gate: Gate,
    source: readonly Source[],
    testId: (item: Source) => string,
  ) =>
    defineFamily<number>({
      id,
      label,
      variants: variants(source, (item) => ({
        arg: item.value,
        label: item.label,
        testId: testId(item),
      })),
      enabled: (ctx) => gate(ctx) && has(key),
      run: (_ctx, arg) => {
        (p()[key] as ((value: number) => void) | undefined)?.(arg);
      },
    });

  const exportCommand = (
    suffix: string,
    label: string,
    key: ActionKey,
    testId: string,
    extraGate: () => boolean = () => true,
  ) =>
    defineCommand({
      id: `file.export.${suffix}`,
      label,
      testId,
      keywords: ['export', 'download', 'save'],
      enabled: (ctx) => ctx.hasScore && has(key) && extraGate(),
      run: () => {
        (p()[key] as (() => void) | undefined)?.();
      },
    });

  const headerText = (target: 'title' | 'subtitle' | 'composer' | 'lyricist', label: string) =>
    defineCommand<{ point?: { clientX: number; clientY: number } } | undefined>({
      id: `add.text.${target}`,
      label,
      testId: `btn-text-${target}`,
      opensDialog: true,
      enabled: (ctx) => ctx.isMutable && has('onOpenHeaderEditor'),
      run: (_ctx, args) => {
        p().onOpenHeaderEditor?.(target, args?.point ?? centre());
      },
    });

  const audioReady = () => Boolean(p().audioAvailable);

  return [
    // ── File ────────────────────────────────────────────────────────────────────────
    action('file.new', 'New Score', 'onNewScore', always, {
      testId: 'btn-new-score',
      opensDialog: true,
    }),
    defineCommand<File | undefined>({
      id: 'file.open',
      label: 'Open Score',
      testId: 'open-score-input',
      opensDialog: true,
      keywords: ['load', 'import'],
      run: async (_ctx, file) => {
        const chosen = file ?? (await pickFile('.mscz,.mscx,.mxl,.xml,.musicxml'));
        if (chosen) p().onFileUpload(chosen);
      },
    }),
    action('compare.load', 'Compare Scores', 'onLoadScoresToCompare', always, {
      testId: 'btn-load-scores-to-compare',
      opensDialog: true,
      keywords: ['diff', 'load scores to compare'],
    }),
    exportCommand('mscz', 'Export MuseScore (.mscz)', 'onExportMscz', 'btn-export-mscz'),
    exportCommand('pdf', 'Export PDF', 'onExportPdf', 'btn-export-pdf'),
    exportCommand('svg', 'Export SVG', 'onExportSvg', 'btn-export-svg'),
    exportCommand('png', 'Export PNG', 'onExportPng', 'btn-export-png', () =>
      Boolean(p().pngAvailable),
    ),
    exportCommand(
      'mscx',
      'Export MuseScore Uncompressed (.mscx)',
      'onExportMscx',
      'btn-export-mscx',
    ),
    exportCommand('musicxml', 'Export MusicXML', 'onExportMusicXml', 'btn-export-musicxml'),
    exportCommand('mxl', 'Export Compressed MusicXML (.mxl)', 'onExportMxl', 'btn-export-mxl'),
    exportCommand('abc', 'Export ABC', 'onExportAbc', 'btn-export-abc'),
    exportCommand('midi', 'Export MIDI', 'onExportMidi', 'btn-export-midi'),
    exportCommand('audio', 'Export Audio (WAV)', 'onExportAudio', 'btn-export-audio', () =>
      Boolean(p().audioAvailable && !p().audioBusy),
    ),
    exportCommand(
      'pageAudio',
      'Export Current Page Audio',
      'onExportCurrentPageAudio',
      'btn-export-current-page-audio',
      () => Boolean(p().audioAvailable && !p().audioBusy),
    ),
    defineCommand({
      id: 'file.drive.upload',
      label: 'Upload to Google Drive',
      testId: 'btn-export-google-drive',
      opensDialog: true,
      keywords: ['export'],
      enabled: (ctx) => ctx.hasScore && has('onExportToGoogleDrive'),
      run: () => p().onExportToGoogleDrive?.(),
    }),
    action('file.shareLink', 'Create Share Link', 'onCreateShareableLink', always, {
      testId: 'btn-create-share-link',
      opensDialog: true,
    }),
    defineCommand<File | undefined>({
      id: 'playback.soundfont',
      label: 'Load SoundFont',
      testId: 'soundfont-input',
      opensDialog: true,
      keywords: ['sf2', 'sf3'],
      enabled: () => has('onSoundFontUpload'),
      run: async (_ctx, file) => {
        const chosen = file ?? (await pickFile('.sf2,.sf3'));
        if (chosen) p().onSoundFontUpload?.(chosen);
      },
    }),

    // ── Playback ────────────────────────────────────────────────────────────────────
    defineCommand({
      id: 'playback.playPause',
      label: 'Play or Pause',
      testId: 'btn-play',
      keywords: ['play', 'pause', 'resume'],
      enabled: () => {
        const props = p();
        const transportActive = Boolean(props.isPlaying || props.isPaused);
        // audioBusy covers the whole of a streamed playback, so it only guards startup.
        const startupBusy = Boolean(props.audioBusy) && !transportActive;
        return audioReady() && Boolean(props.onTogglePlayPause) && !startupBusy;
      },
      run: () => p().onTogglePlayPause?.(),
    }),
    defineCommand({
      id: 'playback.stop',
      label: 'Stop',
      testId: 'btn-stop',
      keywords: ['rewind'],
      enabled: () => audioReady() && has('onStopAudio') && Boolean(p().isPlaying || p().isPaused),
      run: () => p().onStopAudio?.(),
    }),
    defineCommand({
      id: 'playback.playFromSelection',
      label: 'Play From Selection',
      testId: 'btn-play-from-selection',
      enabled: (ctx) =>
        audioReady() &&
        has('onPlayFromSelectionAudio') &&
        ctx.selection !== 'none' &&
        !p().audioBusy,
      run: () => p().onPlayFromSelectionAudio?.(),
    }),

    // ── View ────────────────────────────────────────────────────────────────────────
    defineCommand({
      id: 'view.zoom.in',
      label: 'Zoom In',
      testId: 'btn-zoom-in',
      run: () => p().onZoomIn(),
    }),
    defineCommand({
      id: 'view.zoom.out',
      label: 'Zoom Out',
      testId: 'btn-zoom-out',
      run: () => p().onZoomOut(),
    }),
    action('view.zoom.fitWidth', 'Fit Width', 'onFitWidth', always, { testId: 'btn-fit-width' }),
    action('view.zoom.fitHeight', 'Fit Height', 'onFitHeight', always, {
      testId: 'btn-fit-height',
    }),
    defineFamily<number>({
      id: 'view.zoom.preset',
      label: 'Zoom',
      variants: zoomPresets.map((preset) => ({
        arg: preset,
        label: `${Math.round(preset * 100)}%`,
        testId: `zoom-preset-${Math.round(preset * 100)}`,
      })),
      enabled: () => has('onSetZoom'),
      run: (_ctx, zoom) => p().onSetZoom?.(zoom),
    }),
    defineCommand({
      id: 'view.panel.palettes',
      label: 'Palettes',
      testId: 'btn-toggle-palettes',
      keywords: ['floating palettes', 'toggle'],
      enabled: () => has('onTogglePalettes'),
      checked: () => Boolean(p().palettesOpen),
      run: () => p().onTogglePalettes?.(),
    }),
    defineCommand({
      id: 'view.panels.toggle',
      label: 'Toggle All Panels',
      testId: 'btn-toggle-panels',
      keywords: ['side panels', 'hide', 'show'],
      enabled: () => has('onTogglePanels'),
      run: () => p().onTogglePanels?.(),
    }),
    defineFamily<string>({
      id: 'view.palette.open',
      label: 'Open Palette',
      variants: paletteLinkOptions.map((option) => ({
        arg: option.category,
        label: option.label,
        testId: option.testId,
      })),
      enabled: () => has('onOpenPalette'),
      run: (_ctx, category) => p().onOpenPalette?.(category),
    }),

    // ── Edit ────────────────────────────────────────────────────────────────────────
    action('edit.undo', 'Undo', 'onUndo', mutable, { testId: 'btn-undo' }),
    action('edit.redo', 'Redo', 'onRedo', mutable, { testId: 'btn-redo' }),
    action('edit.delete', 'Delete', 'onDeleteSelection', withSelection, { testId: 'btn-delete' }),
    action('edit.selectAll', 'Select All', 'onSelectAll', mutable, { testId: 'btn-select-all' }),
    defineFamily<number>({
      id: 'edit.selectionFilter',
      label: 'Selection Filter',
      variants: variants(selectionFilterOptions, (option) => ({
        arg: option.bit,
        label: option.label,
        testId: `selection-filter-${option.bit}`,
      })),
      enabled: (ctx) => ctx.isMutable && has('onSetSelectionFilterBit'),
      checked: (_ctx, bit) => Boolean((p().selectionFilterMask ?? 0xffffff) & bit),
      run: (_ctx, bit) => {
        const checked = Boolean((p().selectionFilterMask ?? 0xffffff) & bit);
        p().onSetSelectionFilterBit?.(bit, !checked);
      },
    }),
    action('edit.pitch.up', 'Pitch Up', 'onPitchUp', withSelectionOutsideInput, {
      testId: 'btn-pitch-up',
    }),
    action('edit.pitch.down', 'Pitch Down', 'onPitchDown', withSelectionOutsideInput, {
      testId: 'btn-pitch-down',
    }),
    defineCommand({
      id: 'edit.pitch.octaveUp',
      label: 'Up an Octave',
      testId: 'btn-transpose-12',
      enabled: (ctx) => withSelectionOutsideInput(ctx) && has('onTranspose'),
      run: () => p().onTranspose?.(12),
    }),
    defineCommand({
      id: 'edit.pitch.octaveDown',
      label: 'Down an Octave',
      testId: 'btn-transpose--12',
      enabled: (ctx) => withSelectionOutsideInput(ctx) && has('onTranspose'),
      run: () => p().onTranspose?.(-12),
    }),
    action('edit.duration.shorter', 'Shorter', 'onDurationShorter', withSelectionOutsideInput, {
      testId: 'btn-duration-shorter',
    }),
    action('edit.duration.longer', 'Longer', 'onDurationLonger', withSelectionOutsideInput, {
      testId: 'btn-duration-longer',
    }),
    action('edit.duration.dot', 'Dot', 'onToggleDot', withTarget, { testId: 'btn-dot' }),
    action(
      'edit.duration.doubleDot',
      'Double Dot',
      'onToggleDoubleDot',
      withSelectionOutsideInput,
      {
        testId: 'btn-double-dot',
      },
    ),
    defineFamily<number>({
      id: 'edit.duration.set',
      label: 'Duration',
      variants: variants(durationOptions, (option) => ({
        arg: option.value,
        label: option.label,
        testId: option.testId,
      })),
      enabled: (ctx) => withTarget(ctx) && has('onSetDurationType'),
      run: (_ctx, durationType) => p().onSetDurationType?.(durationType),
    }),

    // ── Add: notes ──────────────────────────────────────────────────────────────────
    defineCommand({
      id: 'add.noteInput',
      label: 'Note Input',
      testId: 'btn-note-input',
      shortcut: 'N',
      keywords: ['enter notes'],
      enabled: (ctx) => ctx.isMutable && has('onToggleNoteInput'),
      checked: (ctx) => ctx.noteInput,
      run: () => p().onToggleNoteInput?.(),
    }),
    numberFamily(
      'add.inputMethod',
      'Note Input Method',
      'onSetNoteInputMethod',
      (ctx) => ctx.isMutable && ctx.noteInput,
      noteInputMethodOptions,
      (option) => `btn-note-input-method-${option.value}`,
    ),
    defineFamily<number>({
      id: 'add.accidental',
      label: 'Accidental',
      variants: variants(accidentalOptions, (option) => ({
        arg: option.value,
        label: option.name,
        testId: `btn-acc-${option.value}`,
      })),
      enabled: (ctx) => withTarget(ctx) && has('onSetAccidental'),
      run: (_ctx, accidentalType) => p().onSetAccidental?.(accidentalType),
    }),
    numberFamily(
      'add.tuplet',
      'Tuplet',
      'onAddTuplet',
      withSelection,
      tupletOptions.map((option) => ({ value: option.count, label: option.label })),
      (option) => `btn-tuplet-${option.value}`,
    ),
    numberFamily(
      'add.grace',
      'Grace Note',
      'onAddGraceNote',
      withSelection,
      graceNoteOptions,
      (option) => option.testId,
    ),
    defineFamily<string>({
      id: 'add.mark.fretboard',
      label: 'Fretboard Diagram',
      variants: variants(fretDiagramOptions, (option) => ({
        arg: option.pattern,
        label: option.label,
        testId: `btn-fretboard-${option.label.toLowerCase()}`,
      })),
      enabled: (ctx) => withSelection(ctx) && has('onAddFretDiagram'),
      run: (_ctx, pattern) => p().onAddFretDiagram?.(pattern),
    }),
    numberFamily(
      'format.beam',
      'Beam',
      'onSetBeamMode',
      withSelection,
      beamOptions,
      (option) => `btn-beam-${option.value}`,
    ),
    defineFamily<number>({
      id: 'tools.voice',
      label: 'Voice',
      // The argument is the engine's zero-based voice index; the label and test id are one-based.
      variants: [1, 2, 3, 4].map((voice) => ({
        arg: voice - 1,
        label: `Voice ${voice}`,
        testId: `btn-voice-${voice}`,
      })),
      enabled: (ctx) => ctx.isMutable && has('onSetVoice'),
      run: (_ctx, voiceIndex) => p().onSetVoice?.(voiceIndex),
    }),
    action('add.line.slur', 'Slur', 'onAddSlur', withSelection, {
      testId: 'btn-slur',
      shortcut: 'S',
    }),
    action('add.line.tie', 'Tie', 'onAddTie', withSelection, { testId: 'btn-tie' }),
    action('format.flip', 'Flip Direction', 'onFlipStem', withSelection, {
      testId: 'btn-flip-stem',
      keywords: ['flip stem'],
    }),

    // ── Add: lines, marks ───────────────────────────────────────────────────────────
    numberFamily(
      'add.line.ottava',
      'Ottava',
      'onAddOttava',
      withSelection,
      ottavaOptions,
      (option) => `btn-ottava-${option.value}`,
    ),
    numberFamily(
      'add.line.trill',
      'Trill Line',
      'onAddTrill',
      withSelection,
      trillOptions,
      (option) => `btn-trill-${option.value}`,
    ),
    numberFamily(
      'add.line.glissando',
      'Glissando',
      'onAddGlissando',
      withSelection,
      glissandoOptions,
      (option) => `btn-glissando-${option.value}`,
    ),
    numberFamily(
      'add.line.hairpin',
      'Hairpin',
      'onAddHairpin',
      withSelection,
      hairpinOptions,
      (option) => option.testId,
    ),
    numberFamily(
      'add.line.pedal',
      'Pedal',
      'onAddPedal',
      withSelection,
      pedalOptions,
      (option) => option.testId,
    ),
    action('add.line.pedal.sostenuto', 'Sostenuto Pedal', 'onAddSostenutoPedal', withSelection, {
      testId: 'btn-pedal-sostenuto',
    }),
    action('add.line.pedal.unaCorda', 'Una Corda', 'onAddUnaCorda', withSelection, {
      testId: 'btn-pedal-una-corda',
    }),
    action('add.line.pedal.split', 'Pedal Change', 'onSplitPedal', withSelection, {
      testId: 'btn-pedal-split',
    }),
    defineFamily<number>({
      id: 'add.mark.dynamic',
      label: 'Dynamic',
      variants: variants(dynamicOptions, (option) => ({
        arg: option.value,
        label: option.label,
        testId: `btn-dynamic-${option.value}`,
      })),
      enabled: (ctx) => withSelection(ctx) && has('onAddDynamic'),
      run: (_ctx, dynamicType) => p().onAddDynamic?.(dynamicType),
    }),
    defineFamily<string>({
      id: 'add.mark.articulation',
      label: 'Articulation',
      variants: variants(articulationOptions, (option) => ({
        arg: option.symbol,
        label: option.label,
        testId: `btn-artic-${option.symbol}`,
      })),
      enabled: (ctx) => withSelection(ctx) && has('onAddArticulation'),
      run: (_ctx, symbol) => p().onAddArticulation?.(symbol),
    }),
    numberFamily(
      'add.mark.fermata',
      'Fermata',
      'onAddFermata',
      withSelection,
      fermataOptions,
      (option) => `btn-fermata-${option.value}`,
    ),
    numberFamily(
      'add.mark.breath',
      'Breath or Caesura',
      'onAddBreath',
      withSelection,
      breathOptions,
      (option) => `btn-breath-${option.value}`,
    ),
    numberFamily(
      'add.mark.arpeggio',
      'Arpeggio',
      'onAddArpeggio',
      withSelection,
      arpeggioOptions,
      (option) => `btn-arpeggio-${option.value}`,
    ),
    numberFamily(
      'add.mark.tremolo',
      'Tremolo',
      'onAddTremolo',
      withSelection,
      tremoloOptions,
      (option) => `btn-tremolo-${option.value}`,
    ),

    // ── Add: text ───────────────────────────────────────────────────────────────────
    headerText('title', 'Title'),
    headerText('subtitle', 'Subtitle'),
    headerText('composer', 'Composer'),
    headerText('lyricist', 'Lyricist'),
    action('add.text.staff', 'Staff Text', 'onAddStaffText', withSelection, {
      testId: 'btn-text-staff',
    }),
    action('add.text.system', 'System Text', 'onAddSystemText', withSelection, {
      testId: 'btn-text-system',
    }),
    action('add.text.expression', 'Expression Text', 'onAddExpressionText', withSelection, {
      testId: 'btn-text-expression',
    }),
    action('add.text.lyrics', 'Lyrics', 'onAddLyricText', withSelection, {
      testId: 'btn-text-lyrics',
    }),
    defineFamily<0 | 1 | 2>({
      id: 'add.text.harmony',
      label: 'Harmony',
      variants: [
        { arg: 0, label: 'Chord Symbol', testId: 'btn-text-harmony-standard' },
        { arg: 1, label: 'Roman Numeral', testId: 'btn-text-harmony-roman' },
        { arg: 2, label: 'Nashville Number', testId: 'btn-text-harmony-nashville' },
      ],
      enabled: (ctx) => withSelection(ctx) && has('onAddHarmonyText'),
      run: (_ctx, variant) => p().onAddHarmonyText?.(variant),
    }),
    action('add.text.figuredBass', 'Figured Bass', 'onAddFiguredBassText', withSelection, {
      testId: 'btn-text-figured-bass',
    }),
    action('add.text.fingering', 'Fingering', 'onAddFingeringText', withSelection, {
      testId: 'btn-text-fingering',
    }),
    action(
      'add.text.fingering.lh',
      'LH Guitar Fingering',
      'onAddLeftHandGuitarFingeringText',
      withSelection,
      { testId: 'btn-text-fingering-lh' },
    ),
    action(
      'add.text.fingering.rh',
      'RH Guitar Fingering',
      'onAddRightHandGuitarFingeringText',
      withSelection,
      { testId: 'btn-text-fingering-rh' },
    ),
    action('add.text.stringNumber', 'String Number', 'onAddStringNumberText', withSelection, {
      testId: 'btn-text-string-number',
    }),
    action('add.text.sticking', 'Sticking', 'onAddStickingText', withSelection, {
      testId: 'btn-text-sticking',
    }),
    action(
      'add.text.instrumentChange',
      'Instrument Change',
      'onAddInstrumentChangeText',
      withSelection,
      { testId: 'btn-text-instrument-change' },
    ),
    defineCommand<{ bpm?: number } | undefined>({
      id: 'add.text.tempo',
      label: 'Tempo',
      testId: 'btn-tempo-apply',
      keywords: ['bpm', 'metronome'],
      enabled: (ctx) => ctx.isMutable && has('onAddTempoText'),
      // Same sanitising as the ribbon's Apply: whole BPM, at least 1, 120 when unparseable.
      run: (_ctx, args) => p().onAddTempoText?.(integer(args?.bpm, 120)),
    }),

    // ── Add: bars and signatures ────────────────────────────────────────────────────
    defineCommand<{ count?: number; target?: MeasureInsertTarget } | undefined>({
      id: 'add.measures',
      label: 'Insert Measures',
      testId: 'btn-insert-measures',
      opensDialog: true,
      keywords: ['add bars'],
      enabled: (ctx) => ctx.isMutable && !p().insertMeasuresDisabled && has('onInsertMeasures'),
      run: (_ctx, args) =>
        p().onInsertMeasures?.(integer(args?.count, 1), args?.target ?? 'after-selection'),
    }),
    defineCommand<{ numerator?: number; denominator?: number } | undefined>({
      id: 'add.pickup',
      label: 'Add Pickup',
      testId: 'btn-add-pickup',
      opensDialog: true,
      enabled: (ctx) => ctx.isMutable && has('onAddPickup'),
      run: (_ctx, args) =>
        p().onAddPickup?.(integer(args?.numerator, 1), integer(args?.denominator, 4)),
    }),
    defineFamily<TimeSignatureArgs>({
      id: 'add.timeSig',
      label: 'Time Signature',
      variants: variants(signatureOptionsDefault, (option) => ({
        arg: {
          numerator: option.numerator,
          denominator: option.denominator,
          timeSigType: option.timeSigType,
        },
        label: option.label,
        testId: `btn-timesig-${option.numerator}-${option.denominator}`,
      })),
      // Any numerator and denominator is accepted, not just the listed presets.
      enabled: (ctx) => ctx.isMutable && has('onSetTimeSignature'),
      run: (_ctx, sig) => p().onSetTimeSignature?.(sig.numerator, sig.denominator, sig.timeSigType),
    }),
    defineCommand<{ numerator: number; denominator: number }>({
      id: 'add.timeSig.custom',
      label: 'Custom Time Signature',
      testId: 'btn-timesig-custom',
      opensDialog: true,
      enabled: (ctx) => ctx.isMutable && has('onSetTimeSignature'),
      run: (_ctx, args) => {
        const { numerator, denominator } = args ?? {};
        if (
          !Number.isInteger(numerator) ||
          !Number.isInteger(denominator) ||
          numerator <= 0 ||
          denominator <= 0
        ) {
          throw new RangeError(
            'A custom time signature needs a positive numerator and denominator.',
          );
        }
        p().onSetTimeSignature?.(numerator, denominator);
      },
    }),
    numberFamily(
      'add.keySig',
      'Key Signature',
      'onSetKeySignature',
      mutable,
      keySignatureButtonOptionsDefault.map((option) => ({
        value: option.fifths,
        label: option.label,
      })),
      (option) => `btn-keysig-${option.value}`,
    ),
    numberFamily(
      'add.clef',
      'Clef',
      'onSetClef',
      mutable,
      clefButtonOptionsDefault,
      (option) => `btn-clef-${option.value}`,
    ),

    // ── Add: repeats and navigation ─────────────────────────────────────────────────
    action('add.repeat.start', 'Start Repeat', 'onToggleRepeatStart', withSelection, {
      testId: 'btn-repeat-start',
    }),
    action('add.repeat.end', 'End Repeat', 'onToggleRepeatEnd', withSelection, {
      testId: 'btn-repeat-end',
    }),
    numberFamily(
      'add.repeat.count',
      'Repeat Count',
      'onSetRepeatCount',
      withSelection,
      repeatCountOptions.map((option) => ({ value: option.count, label: option.label })),
      (option) => `btn-repeat-count-${option.value}`,
    ),
    numberFamily(
      'add.barline',
      'Barline',
      'onSetBarLineType',
      withSelection,
      barlineOptions,
      (option) => `btn-barline-${option.value}`,
    ),
    numberFamily(
      'add.volta',
      'Volta',
      'onAddVolta',
      withSelection,
      voltaOptions.map((option) => ({ value: option.ending, label: option.label })),
      (option) => `btn-volta-${option.value}`,
    ),
    numberFamily(
      'add.marker',
      'Marker',
      'onAddMarker',
      withSelection,
      markerOptions,
      (option) => `btn-marker-${option.value}`,
    ),
    numberFamily(
      'add.jump',
      'Jump',
      'onAddJump',
      withSelection,
      jumpOptions,
      (option) => `btn-jump-${option.value}`,
    ),
    action('add.ambitus', 'Ambitus', 'onAddAmbitus', withSelection, { testId: 'btn-add-ambitus' }),

    // ── Format ──────────────────────────────────────────────────────────────────────
    action('format.break.line', 'Line Break', 'onToggleLineBreak', withSelection, {
      testId: 'btn-new-line',
      keywords: ['new line', 'system break'],
    }),
    action('format.break.page', 'Page Break', 'onTogglePageBreak', withSelection, {
      testId: 'btn-new-page',
      keywords: ['new page'],
    }),

    // ── Tools ───────────────────────────────────────────────────────────────────────
    defineCommand({
      id: 'tools.transpose',
      label: 'Transpose',
      testId: 'btn-transpose-dialog',
      opensDialog: true,
      enabled: (ctx) =>
        ctx.isMutable && !ctx.noteInput && has('onTransposeEx') && has('onOpenTransposeDialog'),
      run: () => p().onOpenTransposeDialog?.(),
    }),
    action('tools.explode', 'Explode', 'onExplodeSelection', withSelection, {
      testId: 'btn-explode-selection',
    }),
    action('tools.implode', 'Implode', 'onImplodeSelection', withSelection, {
      testId: 'btn-implode-selection',
    }),
    action('tools.regroup', 'Regroup Rhythms', 'onRegroupSelection', withSelection, {
      testId: 'btn-regroup-selection',
    }),
    action(
      'tools.resequence',
      'Resequence Rehearsal Marks',
      'onResequenceRehearsalMarks',
      withSelection,
      { testId: 'btn-resequence-rehearsal' },
    ),
    action(
      'tools.measures.removeSelected',
      'Remove Selected Measures',
      'onRemoveContainingMeasures',
      withSelection,
      { testId: 'btn-remove-containing-measures', keywords: ['delete bars'] },
    ),
    action(
      'tools.measures.removeTrailingEmpty',
      'Remove Empty Trailing Measures',
      'onRemoveTrailingEmptyMeasures',
      mutable,
      { testId: 'btn-remove-trailing-empty', keywords: ['delete bars'] },
    ),

    // ── Instruments ─────────────────────────────────────────────────────────────────
    defineCommand<{ instrumentId: string }>({
      id: 'instruments.add',
      label: 'Add Instrument',
      testId: 'select-instrument-add',
      keywords: ['part', 'staff'],
      enabled: (ctx) => ctx.isMutable && ctx.hasScore && has('onAddPart'),
      run: (_ctx, args) => {
        if (!args?.instrumentId) throw new RangeError('Add Instrument needs an instrumentId.');
        p().onAddPart?.(args.instrumentId);
      },
    }),
    defineCommand<{ index: number }>({
      id: 'instruments.part.toggleVisible',
      label: 'Show or Hide Instrument',
      enabled: (ctx) => ctx.isMutable && has('onTogglePartVisible'),
      run: (_ctx, args) => {
        const part = p().parts?.find((entry) => entry.index === args?.index);
        if (!part) throw new RangeError(`No part with index ${String(args?.index)}.`);
        p().onTogglePartVisible?.(part.index, !part.isVisible);
      },
    }),
    defineCommand<{ index: number }>({
      id: 'instruments.part.remove',
      label: 'Remove Instrument',
      keywords: ['delete part'],
      enabled: (ctx) => ctx.isMutable && has('onRemovePart'),
      run: async (_ctx, args) => {
        const part = p().parts?.find((entry) => entry.index === args?.index);
        if (!part) throw new RangeError(`No part with index ${String(args?.index)}.`);
        const name = part.name || part.instrumentName || 'this part';
        const confirmed = await confirmDialog({
          title: `Remove ${name}?`,
          message: 'This removes the instrument and its notes from the score.',
          confirmLabel: 'Remove',
          destructive: true,
        });
        if (confirmed) p().onRemovePart?.(part.index);
      },
    }),

    // ── Help ────────────────────────────────────────────────────────────────────────
    defineCommand({
      id: 'help.open',
      label: 'Editor Help',
      testId: 'link-help',
      shortcut: 'F1',
      run: () => {
        window.open(getHelpHref(), '_blank', 'noopener,noreferrer');
      },
    }),
  ];
}

/**
 * The context the ribbon implies. `ToolbarSectionProps` knows only whether *something* is
 * selected, so `selection` is `'none'` or `'single'`; the ribbon's rules never ask which
 * kind. Undo and redo are enabled whenever mutation is, as in the ribbon. Phase 1 supplies
 * the real selection kind and undo depth from `ScoreEditor`.
 */
export function deriveRibbonCommandContext(props: Props): CommandContext {
  const isMutable = Boolean(props.mutationsEnabled);
  return {
    mode: 'write',
    hasScore: Boolean(props.exportsEnabled),
    selection: props.selectionActive ? 'single' : 'none',
    noteInput: Boolean(props.noteInputActive),
    canUndo: isMutable && Boolean(props.onUndo),
    canRedo: isMutable && Boolean(props.onRedo),
    aiEnabled: false,
    isMutable,
  };
}
