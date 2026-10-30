import type { MeasureProperties, SelectOptions, StaffProperties, StyleValue } from '../../../lib/webmscore-loader';
import type { StaffTextSwing, TextStyleEntry, TimeSigProperties } from '../../../lib/webmscore-score-settings-types';
import { staffTextPropertiesDialog, systemTextPropertiesDialog } from './staffTextDialog';
import { styleDialog } from './styleDialog';
import { timeSigPropertiesDialog, type TimeSigUpdate } from './timeSigDialog';

/**
 * The score's settings dialogs, as data: MuseScore's Page Settings, Style (a curated first set, roadmap E08),
 * Measure Properties, Select ▸ More… and Realize Chord Symbols
 * (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md, Phase 4). A spec says which fields a dialog shows,
 * how to read them from the engine and how to write them back; `ScoreDialog` renders any of them.
 */

export type FieldValue = number | boolean | string;

export type DialogField =
  | {
      readonly kind: 'number';
      readonly key: string;
      readonly label: string;
      readonly min?: number;
      readonly max?: number;
      readonly step?: number;
      /** Shown after the input: "mm", "sp". */
      readonly unit?: string;
    }
  | { readonly kind: 'boolean'; readonly key: string; readonly label: string }
  | { readonly kind: 'text'; readonly key: string; readonly label: string }
  | {
      readonly kind: 'select';
      readonly key: string;
      readonly label: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
    }
  | { readonly kind: 'heading'; readonly key: string; readonly label: string }
  /** Starts a page: a dialog with pages shows a page list and one page at a time (MuseScore's Style dialog). */
  | {
      readonly kind: 'page';
      readonly key: string;
      readonly label: string;
      /** 1: a sub-page, indented under the page before it (MuseScore's text styles under Text styles). */
      readonly level?: 1;
    }
  /** A colour as "#RRGGBBAA"; the picker edits the RGB and keeps the alpha. */
  | { readonly kind: 'color'; readonly key: string; readonly label: string }
  | {
      /**
       * One row of MuseScore's beam-group editor: the value holds a digit per note (0 beamed to the previous note,
       * 1 new beam, 2 new 16th sub-beam, 3 new 32nd sub-beam), and each gap toggles through 0..maxState.
       */
      readonly kind: 'beamGroups';
      readonly key: string;
      readonly label: string;
      readonly maxState: 1 | 2 | 3;
    };

/** What the dialogs need from the engine: the `Score` methods behind them. */
export interface DialogEngine {
  getStyleValues(keys: string[]): Promise<Record<string, StyleValue>>;
  setStyleValues(values: Record<string, StyleValue>): Promise<boolean> | boolean;
  getStyleDefaults(keys: string[]): Promise<Record<string, StyleValue>>;
  getTextStyleCatalog(): Promise<TextStyleEntry[]>;
  getMeasureProperties(): Promise<Partial<MeasureProperties>>;
  setMeasureProperties(values: Partial<MeasureProperties>): Promise<boolean> | boolean;
  selectWithOptions(page: number, x: number, y: number, options: SelectOptions): Promise<boolean> | boolean;
  realizeChordSymbols(literal: boolean, voicing: number, duration: number): Promise<boolean> | boolean;
  getStaffProperties(staffIdx: number): Promise<Partial<StaffProperties>>;
  setStaffProperties(staffIdx: number, values: Partial<StaffProperties>): Promise<boolean> | boolean;
  changeInstrumentAt(instrumentId: string): Promise<boolean> | boolean;
  /** The staff the single selection is on, or null. */
  selectedStaffIdx(): Promise<number | null>;
  getStaffTextSwing(): Promise<Partial<StaffTextSwing>>;
  setStaffTextSwing(values: Omit<StaffTextSwing, 'system'>): Promise<boolean> | boolean;
  getTimeSigProperties(): Promise<Partial<TimeSigProperties>>;
  setTimeSigProperties(values: TimeSigUpdate): Promise<boolean> | boolean;
  getHarpPedalState(): Promise<{ pedals?: string[]; isDiagram?: boolean }>;
  setHarpPedalState(state: { pedals?: string[]; isDiagram?: boolean }): Promise<boolean> | boolean;
}

/** Where Select ▸ More… takes its pattern: the right-clicked element, or (absent) the single selection. */
export interface DialogContext {
  readonly at?: { readonly page: number; readonly x: number; readonly y: number };
  /** The pattern is a note: MuseScore's Select Note dialog, with the note filters. */
  readonly note?: boolean;
  /** Staff/Part Properties: the right-clicked staff, else the selection's. */
  readonly staffIdx?: number;
  /** Select Instrument…: the instruments to offer (the editor's loaded templates). */
  readonly instruments?: readonly { readonly id: string; readonly name: string; readonly group: string }[];
}

export interface LoadedDialog {
  fields: DialogField[];
  values: Record<string, FieldValue>;
  /** Defaults by key: a field with one gets a reset button while its value differs. */
  defaults?: Record<string, FieldValue>;
}

export interface DialogSpec {
  readonly title: string;
  readonly submitLabel: string;
  /** Says the edit is lossy or what it acts on, where MuseScore's dialog does. */
  readonly description?: string;
  load(engine: DialogEngine, context: DialogContext): Promise<LoadedDialog>;
  /** Writes the values back; false when the engine refused them. */
  apply(engine: DialogEngine, values: Record<string, FieldValue>, context: DialogContext): Promise<boolean>;
}

export type ScoreDialogKind =
  | 'pageSettings'
  | 'style'
  | 'measureProperties'
  | 'selectMore'
  | 'realizeHarmony'
  | 'staffProperties'
  | 'changeInstrument'
  | 'harpPedals'
  | 'timeSigProperties'
  | 'staffTextProperties'
  | 'systemTextProperties';

const MM_PER_INCH = 25.4;
/** The engine stores spatium in 1/1200 inch (MScore::DPI). */
const SPATIUM_PER_MM = 1200 / MM_PER_INCH;
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

/** MuseScore's Page Settings: sizes and margins in inches in the engine, shown in mm as the dialog can. */
const PAGE_LENGTHS = [
  ['pageWidth', 'Width'],
  ['pageHeight', 'Height'],
  ['pageOddTopMargin', 'Top margin'],
  ['pageOddBottomMargin', 'Bottom margin'],
  ['pageOddLeftMargin', 'Left margin'],
  ['pageEvenTopMargin', 'Even-page top margin'],
  ['pageEvenBottomMargin', 'Even-page bottom margin'],
  ['pageEvenLeftMargin', 'Even-page left margin'],
] as const;

export const pageSettingsDialog: DialogSpec = {
  title: 'Page Settings',
  submitLabel: 'Apply',
  async load(engine) {
    const keys = [...PAGE_LENGTHS.map(([key]) => key), 'pageTwosided', 'spatium'];
    const raw = await engine.getStyleValues(keys);
    const values: Record<string, FieldValue> = {};
    for (const [key] of PAGE_LENGTHS) values[key] = round(Number(raw[key]) * MM_PER_INCH);
    values.pageTwosided = Boolean(raw.pageTwosided);
    values.spatium = round(Number(raw.spatium) / SPATIUM_PER_MM, 3);
    const fields: DialogField[] = [
      ...PAGE_LENGTHS.map(([key, label]): DialogField => ({ kind: 'number', key, label, min: 0, step: 0.1, unit: 'mm' })),
      { kind: 'boolean', key: 'pageTwosided', label: 'Two-sided (even pages use their own margins)' },
      { kind: 'number', key: 'spatium', label: 'Staff space', min: 0.1, step: 0.01, unit: 'mm' },
    ];
    return { fields, values };
  },
  async apply(engine, values) {
    const raw: Record<string, StyleValue> = {};
    for (const [key] of PAGE_LENGTHS) raw[key] = Number(values[key]) / MM_PER_INCH;
    raw.pageTwosided = Boolean(values.pageTwosided);
    raw.spatium = Number(values.spatium) * SPATIUM_PER_MM;
    return Boolean(await engine.setStyleValues(raw));
  },
};

/** The music fonts the engine registers (roadmap E24), and each one's text font as MuseScore pairs them. */
const NUMBER_MODES = [
  { value: '0', label: 'Auto' },
  { value: '1', label: 'Always show' },
  { value: '2', label: 'Always hide' },
];

/** MuseScore's Measure Properties, for the bar the selection starts in. Staves become one pair of switches each. */
export const measurePropertiesDialog: DialogSpec = {
  title: 'Measure Properties',
  submitLabel: 'Apply',
  async load(engine) {
    const m = await engine.getMeasureProperties();
    if (!m.actual || !m.nominal) throw new Error('Select a bar first.');
    const values: Record<string, FieldValue> = {
      actualNumerator: m.actual[0],
      actualDenominator: String(m.actual[1]),
      irregular: Boolean(m.irregular),
      repeatCount: m.repeatCount ?? 2,
      breakMmr: Boolean(m.breakMmr),
      stretch: m.stretch ?? 1,
      numberMode: String(m.numberMode ?? 0),
      numberOffset: m.numberOffset ?? 0,
    };
    const staffFields: DialogField[] = [];
    (m.staves ?? []).forEach((staff, i) => {
      staffFields.push(
        { kind: 'boolean', key: `staff${i}Visible`, label: `${staff.name || `Staff ${i + 1}`}: visible` },
        { kind: 'boolean', key: `staff${i}Stemless`, label: `${staff.name || `Staff ${i + 1}`}: stemless` },
      );
      values[`staff${i}Visible`] = staff.visible;
      values[`staff${i}Stemless`] = staff.stemless;
    });
    const fields: DialogField[] = [
      { kind: 'heading', key: 'duration', label: `Duration (nominal ${m.nominal[0]}/${m.nominal[1]})` },
      { kind: 'number', key: 'actualNumerator', label: 'Actual beats', min: 1, step: 1 },
      {
        kind: 'select',
        key: 'actualDenominator',
        label: 'Beat unit',
        options: ['1', '2', '4', '8', '16', '32', '64'].map((value) => ({ value, label: `1/${value}` })),
      },
      { kind: 'heading', key: 'other', label: 'Other' },
      { kind: 'boolean', key: 'irregular', label: 'Exclude from measure count' },
      { kind: 'number', key: 'numberOffset', label: 'Add to measure number', step: 1 },
      { kind: 'select', key: 'numberMode', label: 'Measure number', options: NUMBER_MODES },
      { kind: 'number', key: 'repeatCount', label: 'Play count (end repeat)', min: 2, step: 1 },
      { kind: 'number', key: 'stretch', label: 'Layout stretch', min: 0.1, step: 0.05 },
      { kind: 'boolean', key: 'breakMmr', label: 'Break multimeasure rest' },
      ...(staffFields.length ? [{ kind: 'heading', key: 'staves', label: 'Staves' } as DialogField, ...staffFields] : []),
    ];
    return { fields, values };
  },
  async apply(engine, values) {
    const staves: { name: string; visible: boolean; stemless: boolean }[] = [];
    for (let i = 0; `staff${i}Visible` in values; i += 1) {
      staves.push({ name: '', visible: Boolean(values[`staff${i}Visible`]), stemless: Boolean(values[`staff${i}Stemless`]) });
    }
    return Boolean(
      await engine.setMeasureProperties({
        actual: [Math.max(1, Math.floor(Number(values.actualNumerator))), Number(values.actualDenominator)],
        irregular: Boolean(values.irregular),
        repeatCount: Math.max(2, Math.floor(Number(values.repeatCount))),
        breakMmr: Boolean(values.breakMmr),
        stretch: Number(values.stretch),
        numberMode: Number(values.numberMode),
        numberOffset: Math.floor(Number(values.numberOffset)),
        staves,
      }),
    );
  },
};

const SELECT_FILTERS: readonly [keyof SelectOptions, string][] = [
  ['sameSubtype', 'Same subtype'],
  ['sameStaff', 'Same staff'],
  ['inSelection', 'In selection'],
  ['sameVoice', 'Same voice'],
  ['sameSystem', 'Same system'],
  ['sameMeasure', 'Same measure'],
  ['sameBeat', 'Same beat'],
  ['sameDuration', 'Same duration'],
];
const NOTE_FILTERS: readonly [keyof SelectOptions, string][] = [
  ['samePitch', 'Same pitch'],
  ['sameNotehead', 'Same notehead'],
  ['sameNoteType', 'Same note type'],
  ['sameString', 'Same string'],
];

/** MuseScore's Select dialog (Select Note for a note): filters, then replace / add to / subtract from the selection. */
export const selectMoreDialog: DialogSpec = {
  title: 'Select',
  submitLabel: 'Select',
  async load(_engine, context) {
    const filters = context.note ? [...NOTE_FILTERS, ...SELECT_FILTERS] : SELECT_FILTERS;
    const fields: DialogField[] = [
      { kind: 'heading', key: 'filters', label: context.note ? 'Notes like this one, with' : 'Elements like this one, with' },
      ...filters.map(([key, label]): DialogField => ({ kind: 'boolean', key, label })),
      { kind: 'heading', key: 'action', label: 'Action' },
      {
        kind: 'select',
        key: 'mode',
        label: 'Selection',
        options: [
          { value: 'replace', label: 'Replace selection' },
          { value: 'add', label: 'Add to selection' },
          { value: 'subtract', label: 'Subtract from selection' },
        ],
      },
      { kind: 'boolean', key: 'fromSelection', label: 'Search only in the selection' },
    ];
    const values: Record<string, FieldValue> = { mode: 'replace', fromSelection: false };
    for (const [key] of filters) values[key] = false;
    return { fields, values };
  },
  async apply(engine, values, context) {
    const options: SelectOptions = { mode: values.mode as SelectOptions['mode'] };
    for (const [key, value] of Object.entries(values)) {
      if (key !== 'mode' && value === true) (options as Record<string, unknown>)[key] = true;
    }
    const at = context.at;
    return Boolean(await engine.selectWithOptions(at?.page ?? -1, at?.x ?? 0, at?.y ?? 0, options));
  },
};

/** MuseScore's Realize Chord Symbols dialog (VoicingSelect); "-1" keeps each symbol's own setting. */
export const realizeHarmonyDialog: DialogSpec = {
  title: 'Realize Chord Symbols',
  submitLabel: 'Realize',
  description: 'The selected chord symbols become notes in their staff.',
  async load() {
    return {
      fields: [
        { kind: 'boolean', key: 'literal', label: 'Literal (play the symbol as written)' },
        {
          kind: 'select',
          key: 'voicing',
          label: 'Voicing',
          options: [
            { value: '-1', label: 'Each symbol’s own' },
            { value: '0', label: 'Automatic' },
            { value: '1', label: 'Root only' },
            { value: '2', label: 'Close' },
            { value: '3', label: 'Drop 2' },
            { value: '4', label: 'Six note' },
            { value: '5', label: 'Four note' },
            { value: '6', label: 'Three note' },
          ],
        },
        {
          kind: 'select',
          key: 'duration',
          label: 'Duration',
          options: [
            { value: '-1', label: 'Each symbol’s own' },
            { value: '0', label: 'Until the next chord symbol' },
            { value: '1', label: 'Until the end of the measure' },
            { value: '2', label: 'Chord or rest duration' },
          ],
        },
      ],
      values: { literal: true, voicing: '-1', duration: '-1' },
    };
  },
  async apply(engine, values) {
    return Boolean(
      await engine.realizeChordSymbols(Boolean(values.literal), Number(values.voicing), Number(values.duration)),
    );
  },
};

const staffOf = async (engine: DialogEngine, context: DialogContext) => {
  const staffIdx = context.staffIdx ?? (await engine.selectedStaffIdx());
  if (staffIdx === null || staffIdx === undefined) throw new Error('Select something on a staff first.');
  return staffIdx;
};

/** MuseScore's Staff/Part Properties (EditStaff): the part's names and the staff's settings. */
export const staffPropertiesDialog: DialogSpec = {
  title: 'Staff/Part Properties',
  submitLabel: 'Apply',
  async load(engine, context) {
    const p = await engine.getStaffProperties(await staffOf(engine, context));
    if (p.visible === undefined) throw new Error('That staff no longer exists.');
    return {
      fields: [
        { kind: 'heading', key: 'part', label: 'Part' },
        { kind: 'text', key: 'partName', label: 'Part name' },
        { kind: 'text', key: 'longName', label: 'Long instrument name' },
        { kind: 'text', key: 'shortName', label: 'Short instrument name' },
        { kind: 'heading', key: 'staff', label: 'Staff' },
        { kind: 'boolean', key: 'visible', label: 'Visible' },
        { kind: 'boolean', key: 'small', label: 'Small staff' },
        { kind: 'number', key: 'lines', label: 'Lines', min: 1, max: 14, step: 1 },
        { kind: 'boolean', key: 'invisibleLines', label: 'Invisible staff lines' },
        { kind: 'boolean', key: 'cutaway', label: 'Cutaway (hide empty measures)' },
        {
          kind: 'select',
          key: 'hideWhenEmpty',
          label: 'Hide when empty',
          options: [
            { value: '0', label: 'Auto' },
            { value: '1', label: 'Always' },
            { value: '2', label: 'Never' },
          ],
        },
      ],
      values: {
        partName: p.partName ?? '',
        longName: p.longName ?? '',
        shortName: p.shortName ?? '',
        visible: Boolean(p.visible),
        small: Boolean(p.small),
        lines: p.lines ?? 5,
        invisibleLines: Boolean(p.invisibleLines),
        cutaway: Boolean(p.cutaway),
        hideWhenEmpty: String(p.hideWhenEmpty ?? 0),
      },
    };
  },
  async apply(engine, values, context) {
    return Boolean(
      await engine.setStaffProperties(await staffOf(engine, context), {
        partName: String(values.partName),
        longName: String(values.longName),
        shortName: String(values.shortName),
        visible: Boolean(values.visible),
        small: Boolean(values.small),
        lines: Math.min(14, Math.max(1, Math.floor(Number(values.lines)))),
        invisibleLines: Boolean(values.invisibleLines),
        cutaway: Boolean(values.cutaway),
        hideWhenEmpty: Number(values.hideWhenEmpty),
      }),
    );
  },
};

/** MuseScore's Select instrument… on an instrument change: the instrument it changes to. */
export const changeInstrumentDialog: DialogSpec = {
  title: 'Select Instrument',
  submitLabel: 'Change',
  description: 'The instrument change switches the part to this instrument, with its clefs and transposition.',
  async load(_engine, context) {
    const instruments = context.instruments ?? [];
    if (!instruments.length) throw new Error('The instrument list is not loaded yet.');
    return {
      fields: [
        {
          kind: 'select',
          key: 'instrument',
          label: 'Instrument',
          options: instruments.map(({ id, name, group }) => ({ value: id, label: group ? `${group}: ${name}` : name })),
        },
      ],
      values: { instrument: instruments[0].id },
    };
  },
  async apply(engine, values) {
    return Boolean(await engine.changeInstrumentAt(String(values.instrument)));
  },
};

/** The harp's strings in MuseScore's pedal order: the left foot's D C B, then the right foot's E F G A. */
const HARP_STRINGS = ['D', 'C', 'B', 'E', 'F', 'G', 'A'] as const;
const PEDAL_OPTIONS = [
  { value: 'flat', label: '♭ Flat' },
  { value: 'natural', label: '♮ Natural' },
  { value: 'sharp', label: '♯ Sharp' },
];

/** MuseScore's harp pedal popup (roadmap E21): each string's pedal, and diagram or text form. */
export const harpPedalsDialog: DialogSpec = {
  title: 'Harp Pedals',
  submitLabel: 'Apply',
  async load(engine) {
    const state = await engine.getHarpPedalState();
    if (!state.pedals || state.pedals.length !== HARP_STRINGS.length) throw new Error('Select a harp pedal diagram first.');
    const values: Record<string, FieldValue> = { isDiagram: Boolean(state.isDiagram) };
    HARP_STRINGS.forEach((string, i) => {
      values[`pedal${string}`] = state.pedals![i];
    });
    return {
      fields: [
        { kind: 'heading', key: 'left', label: 'Left foot' },
        ...HARP_STRINGS.slice(0, 3).map((s): DialogField => ({ kind: 'select', key: `pedal${s}`, label: s, options: PEDAL_OPTIONS })),
        { kind: 'heading', key: 'right', label: 'Right foot' },
        ...HARP_STRINGS.slice(3).map((s): DialogField => ({ kind: 'select', key: `pedal${s}`, label: s, options: PEDAL_OPTIONS })),
        { kind: 'heading', key: 'form', label: 'Display' },
        { kind: 'boolean', key: 'isDiagram', label: 'Show as diagram (otherwise as text)' },
      ],
      values,
    };
  },
  async apply(engine, values) {
    return Boolean(
      await engine.setHarpPedalState({
        pedals: HARP_STRINGS.map((s) => String(values[`pedal${s}`])),
        isDiagram: Boolean(values.isDiagram),
      }),
    );
  },
};

export const DIALOG_SPECS: Record<ScoreDialogKind, DialogSpec> = {
  harpPedals: harpPedalsDialog,
  timeSigProperties: timeSigPropertiesDialog,
  staffTextProperties: staffTextPropertiesDialog,
  systemTextProperties: systemTextPropertiesDialog,
  staffProperties: staffPropertiesDialog,
  changeInstrument: changeInstrumentDialog,
  pageSettings: pageSettingsDialog,
  style: styleDialog,
  measureProperties: measurePropertiesDialog,
  selectMore: selectMoreDialog,
  realizeHarmony: realizeHarmonyDialog,
};
