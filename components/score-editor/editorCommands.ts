import type { MeasureInsertTarget } from './editorProps';
import type { EditorCommandProps } from './editorProps';
import {
  always,
  inNoteInput,
  mutable,
  needsBarTarget,
  needsRange,
  needsSelection,
  needsSelectionOutsideInput,
  needsSingle,
  needsSingleOrInput,
  needsTarget,
  withCheck,
  type Gate,
} from '../../lib/commands/selectionGates';
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
import { openFilePicker } from '../shell/filePickers';
import { pickFile } from './file-picker';

/**
 * Every editor action as a command (SHELL_REDESIGN_DESIGN Phase 0).
 *
 * These are thin adapters over the handlers `ScoreEditor` supplies (`EditorCommandProps`):
 * `run` calls the handler, and `enabled` is the gate the ribbon's `disabled` rule used to be,
 * so a command can never do something its menu item or toolbar button would not. The command
 * ids, labels and legacy test ids are the contract the menus, toolbars and specs share.
 *
 * `getProps` is read when a command runs or is evaluated, never captured, so a command
 * registered once always sees the latest handlers.
 */
type Props = EditorCommandProps;
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

const variants = <Source, Arg>(
  source: readonly Source[],
  map: (item: Source) => CommandVariant<Arg>,
): CommandVariant<Arg>[] => source.map(map);

const centre = () =>
  typeof window === 'undefined'
    ? { clientX: 0, clientY: 0 }
    : { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };

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
  const gated = (gate: Gate, key: keyof Props) => withCheck(gate, () => has(key));

  /** A command that calls one no-argument handler. */
  const action = (
    id: string,
    label: string,
    key: ActionKey,
    gate: Gate,
    extra: {
      testId?: string;
      keywords?: readonly string[];
      opensDialog?: boolean;
    } = {},
  ) =>
    defineCommand({
      id,
      label,
      ...extra,
      enabled: gated(gate, key),
      run: async () => {
        await (p()[key] as (() => unknown) | undefined)?.();
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
      enabled: gated(gate, key),
      run: async (_ctx, arg) => {
        await (p()[key] as ((value: number) => unknown) | undefined)?.(arg);
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
      run: async () => {
        await (p()[key] as (() => unknown) | undefined)?.();
      },
    });

  const headerText = (target: 'title' | 'subtitle' | 'composer' | 'lyricist', label: string) =>
    defineCommand<{ point?: { clientX: number; clientY: number } } | undefined>({
      id: `add.text.${target}`,
      label,
      testId: `btn-text-${target}`,
      opensDialog: true,
      enabled: gated(mutable, 'onOpenHeaderEditor'),
      run: async (_ctx, args) => {
        await p().onOpenHeaderEditor?.(target, args?.point ?? centre());
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
        // With no file, open the shell's own input: its change event runs this command again
        // with the file, so there is one place a score gets chosen.
        if (!file && openFilePicker('score')) return;
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
        if (!file && openFilePicker('soundfont')) return;
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
    action('edit.delete', 'Delete', 'onDeleteSelection', needsSelection, { testId: 'btn-delete' }),
    action('edit.deselect', 'Deselect', 'onClearSelection', needsSelection, {
      keywords: ['clear selection', 'escape'],
    }),
    action('edit.selectAll', 'Select All', 'onSelectAll', mutable, { testId: 'btn-select-all' }),
    action(
      'edit.select.nextChord',
      'Select Next Chord',
      'onSelectNextChord',
      needsSelectionOutsideInput,
      { keywords: ['selection', 'move'] },
    ),
    action(
      'edit.select.prevChord',
      'Select Previous Chord',
      'onSelectPrevChord',
      needsSelectionOutsideInput,
      { keywords: ['selection', 'move'] },
    ),
    action(
      'edit.select.extendNextChord',
      'Extend Selection to Next Chord',
      'onExtendSelectionNextChord',
      needsSelectionOutsideInput,
      { keywords: ['selection', 'move'] },
    ),
    action(
      'edit.select.extendPrevChord',
      'Extend Selection to Previous Chord',
      'onExtendSelectionPrevChord',
      needsSelectionOutsideInput,
      { keywords: ['selection', 'move'] },
    ),
    action(
      'edit.select.extendNextMeasure',
      'Extend Selection to Next Measure',
      'onExtendSelectionNextMeasure',
      needsSelectionOutsideInput,
      { keywords: ['selection', 'move'] },
    ),
    action(
      'edit.select.extendPrevMeasure',
      'Extend Selection to Previous Measure',
      'onExtendSelectionPrevMeasure',
      needsSelectionOutsideInput,
      { keywords: ['selection', 'move'] },
    ),
    action(
      'edit.select.extendStaffAbove',
      'Extend Selection to Staff Above',
      'onExtendSelectionStaffAbove',
      needsSelectionOutsideInput,
      { keywords: ['selection', 'move'] },
    ),
    action(
      'edit.select.extendStaffBelow',
      'Extend Selection to Staff Below',
      'onExtendSelectionStaffBelow',
      needsSelectionOutsideInput,
      { keywords: ['selection', 'move'] },
    ),
    defineFamily<number>({
      id: 'edit.selectionFilter',
      label: 'Selection Filter',
      variants: variants(selectionFilterOptions, (option) => ({
        arg: option.bit,
        label: option.label,
        testId: `selection-filter-${option.bit}`,
      })),
      enabled: gated(mutable, 'onSetSelectionFilterBit'),
      checked: (_ctx, bit) => Boolean((p().selectionFilterMask ?? 0xffffff) & bit),
      run: async (_ctx, bit) => {
        const checked = Boolean((p().selectionFilterMask ?? 0xffffff) & bit);
        await p().onSetSelectionFilterBit?.(bit, !checked);
      },
    }),
    action('edit.pitch.up', 'Pitch Up', 'onPitchUp', needsSelectionOutsideInput, {
      testId: 'btn-pitch-up',
    }),
    action('edit.pitch.down', 'Pitch Down', 'onPitchDown', needsSelectionOutsideInput, {
      testId: 'btn-pitch-down',
    }),
    defineCommand({
      id: 'edit.pitch.octaveUp',
      label: 'Up an Octave',
      testId: 'btn-transpose-12',
      enabled: gated(needsSelectionOutsideInput, 'onTranspose'),
      run: () => p().onTranspose?.(12),
    }),
    defineCommand({
      id: 'edit.pitch.octaveDown',
      label: 'Down an Octave',
      testId: 'btn-transpose--12',
      enabled: gated(needsSelectionOutsideInput, 'onTranspose'),
      run: () => p().onTranspose?.(-12),
    }),
    action('edit.duration.shorter', 'Shorter', 'onDurationShorter', needsSelectionOutsideInput, {
      testId: 'btn-duration-shorter',
    }),
    action('edit.duration.longer', 'Longer', 'onDurationLonger', needsSelectionOutsideInput, {
      testId: 'btn-duration-longer',
    }),
    action('edit.duration.dot', 'Dot', 'onToggleDot', needsSingleOrInput, { testId: 'btn-dot' }),
    action(
      'edit.duration.doubleDot',
      'Double Dot',
      'onToggleDoubleDot',
      needsSelectionOutsideInput,
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
      enabled: gated(needsSingleOrInput, 'onSetDurationType'),
      run: (_ctx, durationType) => p().onSetDurationType?.(durationType),
    }),

    // ── Add: notes ──────────────────────────────────────────────────────────────────
    defineFamily<{ step: number; chord: boolean }>({
      id: 'add.note.step',
      label: 'Note by Letter',
      variants: ['C', 'D', 'E', 'F', 'G', 'A', 'B'].flatMap((letter, step) => [
        { arg: { step, chord: false }, label: `Note ${letter}` },
        { arg: { step, chord: true }, label: `Add ${letter} to chord` },
      ]),
      // In note input the cursor is the target; otherwise the selected note is respelled.
      enabled: gated(needsTarget, 'onAddPitchByStep'),
      run: async (_ctx, { step, chord }) => {
        await p().onAddPitchByStep?.(step, chord);
      },
    }),
    action('add.rest', 'Rest', 'onEnterRest', needsTarget, { keywords: ['enter rest', 'silence'] }),
    defineCommand({
      id: 'add.noteInput',
      label: 'Note Input',
      testId: 'btn-note-input',
      keywords: ['enter notes'],
      enabled: gated(mutable, 'onToggleNoteInput'),
      checked: (ctx) => ctx.noteInput,
      run: () => p().onToggleNoteInput?.(),
    }),
    numberFamily(
      'add.inputMethod',
      'Note Input Method',
      'onSetNoteInputMethod',
      inNoteInput,
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
      enabled: gated(needsTarget, 'onSetAccidental'),
      run: (_ctx, accidentalType) => p().onSetAccidental?.(accidentalType),
    }),
    numberFamily(
      'add.tuplet',
      'Tuplet',
      'onAddTuplet',
      needsSelection,
      tupletOptions.map((option) => ({ value: option.count, label: option.label })),
      (option) => `btn-tuplet-${option.value}`,
    ),
    numberFamily(
      'add.grace',
      'Grace Note',
      'onAddGraceNote',
      needsSelection,
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
      enabled: gated(needsSelection, 'onAddFretDiagram'),
      run: (_ctx, pattern) => p().onAddFretDiagram?.(pattern),
    }),
    numberFamily(
      'format.beam',
      'Beam',
      'onSetBeamMode',
      needsSelection,
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
      enabled: gated(mutable, 'onSetVoice'),
      run: (_ctx, voiceIndex) => p().onSetVoice?.(voiceIndex),
    }),
    action('add.line.slur', 'Slur', 'onAddSlur', needsSelection, {
      testId: 'btn-slur',
    }),
    action('add.line.tie', 'Tie', 'onAddTie', needsSelection, { testId: 'btn-tie' }),
    action('format.flip', 'Flip Direction', 'onFlipStem', needsSelection, {
      testId: 'btn-flip-stem',
      keywords: ['flip stem'],
    }),

    // ── Add: lines, marks ───────────────────────────────────────────────────────────
    numberFamily(
      'add.line.ottava',
      'Ottava',
      'onAddOttava',
      needsSelection,
      ottavaOptions,
      (option) => `btn-ottava-${option.value}`,
    ),
    numberFamily(
      'add.line.trill',
      'Trill Line',
      'onAddTrill',
      needsSelection,
      trillOptions,
      (option) => `btn-trill-${option.value}`,
    ),
    numberFamily(
      'add.line.glissando',
      'Glissando',
      'onAddGlissando',
      needsSelection,
      glissandoOptions,
      (option) => `btn-glissando-${option.value}`,
    ),
    numberFamily(
      'add.line.hairpin',
      'Hairpin',
      'onAddHairpin',
      needsSelection,
      hairpinOptions,
      (option) => option.testId,
    ),
    numberFamily(
      'add.line.pedal',
      'Pedal',
      'onAddPedal',
      needsSelection,
      pedalOptions,
      (option) => option.testId,
    ),
    action('add.line.pedal.sostenuto', 'Sostenuto Pedal', 'onAddSostenutoPedal', needsSelection, {
      testId: 'btn-pedal-sostenuto',
    }),
    action('add.line.pedal.unaCorda', 'Una Corda', 'onAddUnaCorda', needsSelection, {
      testId: 'btn-pedal-una-corda',
    }),
    action('add.line.pedal.split', 'Pedal Change', 'onSplitPedal', needsSelection, {
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
      enabled: gated(needsSingle, 'onAddDynamic'),
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
      enabled: gated(needsSelection, 'onAddArticulation'),
      run: (_ctx, symbol) => p().onAddArticulation?.(symbol),
    }),
    numberFamily(
      'add.mark.fermata',
      'Fermata',
      'onAddFermata',
      needsSelection,
      fermataOptions,
      (option) => `btn-fermata-${option.value}`,
    ),
    numberFamily(
      'add.mark.breath',
      'Breath or Caesura',
      'onAddBreath',
      needsSelection,
      breathOptions,
      (option) => `btn-breath-${option.value}`,
    ),
    numberFamily(
      'add.mark.arpeggio',
      'Arpeggio',
      'onAddArpeggio',
      needsSelection,
      arpeggioOptions,
      (option) => `btn-arpeggio-${option.value}`,
    ),
    numberFamily(
      'add.mark.tremolo',
      'Tremolo',
      'onAddTremolo',
      needsSelection,
      tremoloOptions,
      (option) => `btn-tremolo-${option.value}`,
    ),

    // ── Add: text ───────────────────────────────────────────────────────────────────
    headerText('title', 'Title'),
    headerText('subtitle', 'Subtitle'),
    headerText('composer', 'Composer'),
    headerText('lyricist', 'Lyricist'),
    action('add.text.staff', 'Staff Text', 'onAddStaffText', needsSingle, {
      testId: 'btn-text-staff',
    }),
    action('add.text.system', 'System Text', 'onAddSystemText', needsSelection, {
      testId: 'btn-text-system',
    }),
    action('add.text.expression', 'Expression Text', 'onAddExpressionText', needsSelection, {
      testId: 'btn-text-expression',
    }),
    action('add.text.lyrics', 'Lyrics', 'onAddLyricText', needsSelection, {
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
      enabled: gated(needsSelection, 'onAddHarmonyText'),
      run: (_ctx, variant) => p().onAddHarmonyText?.(variant),
    }),
    action('add.text.figuredBass', 'Figured Bass', 'onAddFiguredBassText', needsSelection, {
      testId: 'btn-text-figured-bass',
    }),
    action('add.text.fingering', 'Fingering', 'onAddFingeringText', needsSelection, {
      testId: 'btn-text-fingering',
    }),
    action(
      'add.text.fingering.lh',
      'LH Guitar Fingering',
      'onAddLeftHandGuitarFingeringText',
      needsSelection,
      { testId: 'btn-text-fingering-lh' },
    ),
    action(
      'add.text.fingering.rh',
      'RH Guitar Fingering',
      'onAddRightHandGuitarFingeringText',
      needsSelection,
      { testId: 'btn-text-fingering-rh' },
    ),
    action('add.text.stringNumber', 'String Number', 'onAddStringNumberText', needsSelection, {
      testId: 'btn-text-string-number',
    }),
    action('add.text.sticking', 'Sticking', 'onAddStickingText', needsSelection, {
      testId: 'btn-text-sticking',
    }),
    action(
      'add.text.instrumentChange',
      'Instrument Change',
      'onAddInstrumentChangeText',
      needsSelection,
      { testId: 'btn-text-instrument-change' },
    ),
    defineCommand<{ bpm?: number } | undefined>({
      id: 'add.text.tempo',
      label: 'Tempo',
      testId: 'btn-tempo-apply',
      keywords: ['bpm', 'metronome'],
      enabled: gated(mutable, 'onAddTempoText'),
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
      enabled: gated(mutable, 'onAddPickup'),
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
      enabled: gated(mutable, 'onSetTimeSignature'),
      run: (_ctx, sig) => p().onSetTimeSignature?.(sig.numerator, sig.denominator, sig.timeSigType),
    }),
    defineCommand<{ numerator: number; denominator: number }>({
      id: 'add.timeSig.custom',
      label: 'Custom Time Signature',
      testId: 'btn-timesig-custom',
      opensDialog: true,
      enabled: gated(mutable, 'onSetTimeSignature'),
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
        return p().onSetTimeSignature?.(numerator, denominator);
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
    action('add.repeat.start', 'Start Repeat', 'onToggleRepeatStart', needsSelection, {
      testId: 'btn-repeat-start',
    }),
    action('add.repeat.end', 'End Repeat', 'onToggleRepeatEnd', needsSelection, {
      testId: 'btn-repeat-end',
    }),
    numberFamily(
      'add.repeat.count',
      'Repeat Count',
      'onSetRepeatCount',
      needsSelection,
      repeatCountOptions.map((option) => ({ value: option.count, label: option.label })),
      (option) => `btn-repeat-count-${option.value}`,
    ),
    numberFamily(
      'add.barline',
      'Barline',
      'onSetBarLineType',
      needsSelection,
      barlineOptions,
      (option) => `btn-barline-${option.value}`,
    ),
    numberFamily(
      'add.volta',
      'Volta',
      'onAddVolta',
      needsSelection,
      voltaOptions.map((option) => ({ value: option.ending, label: option.label })),
      (option) => `btn-volta-${option.value}`,
    ),
    numberFamily(
      'add.marker',
      'Marker',
      'onAddMarker',
      needsSelection,
      markerOptions,
      (option) => `btn-marker-${option.value}`,
    ),
    numberFamily(
      'add.jump',
      'Jump',
      'onAddJump',
      needsSelection,
      jumpOptions,
      (option) => `btn-jump-${option.value}`,
    ),
    action('add.ambitus', 'Ambitus', 'onAddAmbitus', needsSelection, { testId: 'btn-add-ambitus' }),

    // ── Format ──────────────────────────────────────────────────────────────────────
    action('format.break.line', 'Line Break', 'onToggleLineBreak', needsSelection, {
      testId: 'btn-new-line',
      keywords: ['new line', 'system break'],
    }),
    action('format.break.page', 'Page Break', 'onTogglePageBreak', needsSelection, {
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
    action('tools.explode', 'Explode', 'onExplodeSelection', needsRange, {
      testId: 'btn-explode-selection',
    }),
    action('tools.relayout', 'Relayout Score', 'onRelayoutScore', mutable, {
      keywords: ['layout', 'refresh', 'redraw', 'spacing'],
    }),
    action('tools.implode', 'Implode', 'onImplodeSelection', needsRange, {
      testId: 'btn-implode-selection',
    }),
    action('tools.regroup', 'Regroup Rhythms', 'onRegroupSelection', needsRange, {
      testId: 'btn-regroup-selection',
    }),
    action(
      'tools.resequence',
      'Resequence Rehearsal Marks',
      'onResequenceRehearsalMarks',
      needsRange,
      { testId: 'btn-resequence-rehearsal' },
    ),
    action(
      'tools.measures.removeSelected',
      'Remove Selected Measures',
      'onRemoveContainingMeasures',
      needsBarTarget,
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
        return p().onAddPart?.(args.instrumentId);
      },
    }),
    defineCommand<{ index: number }>({
      id: 'instruments.part.toggleVisible',
      label: 'Show or Hide Instrument',
      enabled: gated(mutable, 'onTogglePartVisible'),
      run: (_ctx, args) => {
        const part = p().parts?.find((entry) => entry.index === args?.index);
        if (!part) throw new RangeError(`No part with index ${String(args?.index)}.`);
        return p().onTogglePartVisible?.(part.index, !part.isVisible);
      },
    }),
    defineCommand<{ index: number }>({
      id: 'instruments.part.remove',
      label: 'Remove Instrument',
      keywords: ['delete part'],
      enabled: gated(mutable, 'onRemovePart'),
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
        if (confirmed) await p().onRemovePart?.(part.index);
      },
    }),

    // ── Help ────────────────────────────────────────────────────────────────────────
    defineCommand({
      id: 'help.open',
      label: 'Editor Help',
      testId: 'link-help',
      run: () => {
        window.open(getHelpHref(), '_blank', 'noopener,noreferrer');
      },
    }),
  ];
}

/**
 * The context the ribbon implies. `EditorCommandProps` knows only whether *something* is
 * selected, so `selection` is `'none'` or `'single'`; the ribbon's rules never ask which
 * kind. Undo and redo are enabled whenever mutation is, as in the ribbon. Phase 1 supplies
 * the real selection kind and undo depth from `ScoreEditor`.
 */
export function deriveRibbonCommandContext(props: Props): CommandContext {
  const isMutable = Boolean(props.mutationsEnabled);
  return {
    mode: props.workspaceKind ?? 'write',
    hasScore: Boolean(props.exportsEnabled),
    selection: props.selectionActive ? (props.selectionKind ?? 'single') : 'none',
    noteInput: Boolean(props.noteInputActive),
    canUndo: isMutable && Boolean(props.onUndo),
    canRedo: isMutable && Boolean(props.onRedo),
    aiEnabled: false,
    isMutable,
  };
}
