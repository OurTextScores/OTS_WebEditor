import type { StyleValue } from '../../../lib/webmscore-loader';
import type { DialogField, DialogSpec, FieldValue } from './dialogSpecs';
import generated from './style-pages.generated.json';
import {
  mergePart,
  partKey,
  type PartKind,
  textStyleControls,
  textStyleKeys,
} from './textStylePages';

/**
 * MuseScore's Style dialog (roadmap E08), page by page in MuseScore's order. The pages MuseScore builds from widgets
 * and in QML are generated from its sources (tools/musescore/gen-style-dialog-pages.mjs: editstyle.{cpp,ui} and the
 * styledialog QML pages with their models). Only the keys this engine knows are shown, and each setting can be reset
 * to MuseScore's default.
 */

export const MUSIC_FONTS = [
  'Leland',
  'Bravura',
  'Emmentaler',
  'Gonville',
  'MuseJazz',
  'Petaluma',
  'Finale Maestro',
  'Finale Broadway',
] as const;
export const textFontFor = (font: string) =>
  font === 'Emmentaler' ? 'MScore Text' : `${font} Text`;

interface StyleFieldSpec {
  key: string;
  /** point: an x/y offset in sp (MuseScore's OffsetSelect), shown as two number fields. */
  kind: 'boolean' | 'number' | 'select' | 'text' | 'point';
  label: string;
  group?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** MuseScore shows the stored fraction as a percentage. */
  percent?: boolean;
  options?: { value: number | string | boolean; label: string }[];
}
interface StylePage {
  code: string;
  title: string;
  fields: StyleFieldSpec[];
}

/**
 * Settings OTS offers that MuseScore 4.7's dialog does not show, kept from earlier reviewed slices (E13): the size of
 * stacked chord-symbol modifiers, which MuseScore applies but has no control for.
 */
const OTS_ADDITIONS: Record<string, StyleFieldSpec[]> = {
  'chord-symbols': [
    {
      kind: 'number',
      key: 'chordStackedModifierMag',
      label: 'Stacked modifier scale',
      min: 0.1,
      max: 5,
      step: 0.05,
    },
  ],
};

/**
 * Keys MuseScore changes through a command rather than as a plain style value: concert pitch transposes the score
 * (Score::cmdConcertPitchChanged), which OTS does from its own concert-pitch toggle.
 */
const COMMAND_KEYS = new Set(['concertPitch']);

/** The generated pages, in MuseScore's order (the generator keeps it), with OTS's additions after each page. */
export const STYLE_PAGES: StylePage[] = (generated.pages as StylePage[]).map((page) => ({
  ...page,
  fields: [...page.fields, ...(OTS_ADDITIONS[page.code] ?? [])].filter(
    (f) => !COMMAND_KEYS.has(f.key),
  ),
}));

const ALL_FIELDS = STYLE_PAGES.flatMap((page) => page.fields);
const FIELD_BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));

/** The engine's value as the dialog shows it: percentages scaled, numbers rounded off float noise. */
function toDisplay(field: StyleFieldSpec, value: StyleValue): FieldValue {
  if (Array.isArray(value)) return toDisplay(field, value[1]);
  if (typeof value !== 'number') return value;
  const shown = field.percent ? value * 100 : value;
  return Math.round(shown * 1e6) / 1e6;
}
function fromDisplay(
  field: StyleFieldSpec,
  value: FieldValue,
  engineValue: StyleValue | undefined,
): StyleValue {
  // A choice is the engine's int or boolean (MuseScore's radio pairs), except for string-valued keys (font names).
  if (field.kind === 'select') {
    if (typeof engineValue === 'boolean' || value === 'true' || value === 'false')
      return String(value) === 'true';
    return typeof engineValue !== 'string' && /^-?\d+$/.test(String(value)) ? Number(value) : value;
  }
  if (field.kind === 'number') return field.percent ? Number(value) / 100 : Number(value);
  return value;
}

/** A select's options for this engine value: a string-valued key (a font name) stores the label itself. */
function optionsFor(field: StyleFieldSpec, value: StyleValue) {
  if (field.key === 'musicalSymbolFont') return MUSIC_FONTS.map((f) => ({ value: f, label: f }));
  return (field.options ?? []).map((o) => ({
    value: String(typeof value === 'string' ? o.label : o.value),
    label: o.label,
  }));
}

function dialogField(field: StyleFieldSpec, value: StyleValue): DialogField {
  switch (field.kind) {
    case 'boolean':
      return { kind: 'boolean', key: field.key, label: field.label };
    case 'text':
      return { kind: 'text', key: field.key, label: field.label };
    case 'select':
      return {
        kind: 'select',
        key: field.key,
        label: field.label,
        options: optionsFor(field, value),
      };
    case 'number':
    case 'point': // as its y alone; load() gives a point with an [x, y] value one field per axis
      return {
        kind: 'number',
        key: field.key,
        label: field.label,
        min: field.min,
        max: field.max,
        step: field.step,
        unit: field.percent ? '%' : field.unit,
      };
  }
}

/** The loaded values, kept with the dialog's values so apply sends only what the user changed. */
const LOADED = '__loaded';
/**
 * The engine values behind fields that are not one generated setting: a point or alignment edited per part, and the
 * text styles' keys. Apply merges a part into its value, and types a text style value as the engine had it.
 */
const RAW = '__raw';
const AXES = [
  ['x', 0, 'horizontal'],
  ['y', 1, 'vertical'],
] as const;
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** A text style value back from the dialog, typed as the engine had it. */
function rawFromDisplay(value: FieldValue, engineValue: StyleValue): StyleValue {
  if (typeof engineValue === 'number') return Number(value);
  if (typeof engineValue === 'boolean') return value === true || value === 'true';
  return String(value);
}

export const styleDialog: DialogSpec = {
  title: 'Style',
  submitLabel: 'Apply',
  async load(engine) {
    const keys = ALL_FIELDS.map((f) => f.key);
    const [raw, rawDefaults] = await Promise.all([
      engine.getStyleValues(keys),
      engine.getStyleDefaults(keys),
    ]);
    const fields: DialogField[] = [];
    const values: Record<string, FieldValue> = {};
    const rawValues: Record<string, StyleValue> = {};
    const defaults: Record<string, FieldValue> = {};
    for (const page of STYLE_PAGES) {
      // Only what this engine has: a key it does not know (or cannot type) is not offered.
      const known = page.fields.filter((f) => f.key in raw);
      if (!known.length) continue;
      fields.push({ kind: 'page', key: page.code, label: page.title });
      // No heading for the page's own outer box, nor for a box that is itself a checkbox setting (its settings
      // follow that checkbox), and each heading once per page.
      const checkboxes = new Set(known.filter((f) => f.kind === 'boolean').map((f) => f.label));
      const headed = new Set<string>([page.title.toLowerCase()]);
      for (const field of known) {
        const group = field.group;
        if (group && !checkboxes.has(group) && !headed.has(group.toLowerCase())) {
          headed.add(group.toLowerCase());
          fields.push({ kind: 'heading', key: `${page.code}/${group}`, label: group });
        }
        const value = raw[field.key];
        const fallback = rawDefaults[field.key];
        if (Array.isArray(value)) rawValues[field.key] = value;
        if (field.kind === 'point' && Array.isArray(value)) {
          // An offset: one number field per axis, each with its own reset.
          for (const [axis, i, name] of AXES) {
            const key = partKey(field.key, axis);
            fields.push({
              kind: 'number',
              key,
              label: `${field.label} (${name})`,
              min: -99,
              max: 99,
              step: 0.1,
              unit: field.unit,
            });
            values[key] = round(value[i]);
            if (Array.isArray(fallback)) defaults[key] = round(fallback[i]);
          }
          continue;
        }
        // A number MuseScore edits as a point's y (lyricsPosAbove) reads and writes y alone.
        fields.push(dialogField(field, value));
        values[field.key] = toDisplay(field, value);
        if (fallback !== undefined) defaults[field.key] = toDisplay(field, fallback);
      }
    }
    // MuseScore's Text styles page: a sub-page per editable text style.
    const catalog = (await engine.getTextStyleCatalog()) ?? [];
    if (catalog.length) {
      const styleKeys = textStyleKeys(catalog);
      const [styleRaw, styleDefaults] = await Promise.all([
        engine.getStyleValues(styleKeys),
        engine.getStyleDefaults(styleKeys),
      ]);
      catalog.forEach((entry, index) => {
        const controls = textStyleControls(entry, styleRaw, styleDefaults);
        if (!controls.length) return;
        fields.push({ kind: 'page', key: `text-style-${index}`, label: entry.name, level: 1 });
        for (const control of controls) {
          fields.push(control.field);
          values[control.field.key] = control.value;
          if (control.defaultValue !== undefined)
            defaults[control.field.key] = control.defaultValue;
          rawValues[control.styleKey] = styleRaw[control.styleKey];
        }
      });
    }
    return {
      fields,
      values: { ...values, [LOADED]: JSON.stringify(values), [RAW]: JSON.stringify(rawValues) },
      defaults,
    };
  },
  async apply(engine, values) {
    const loaded: Record<string, FieldValue> =
      typeof values[LOADED] === 'string' ? JSON.parse(values[LOADED]) : {};
    const rawValues: Record<string, StyleValue> =
      typeof values[RAW] === 'string' ? JSON.parse(values[RAW]) : {};
    const changed: Record<string, StyleValue> = {};
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith('__') || (key in loaded && loaded[key] === value)) continue;
      const [base, named] = key.split(':') as [string, PartKind | undefined];
      const field = FIELD_BY_KEY.get(base);
      const raw = rawValues[base];
      if (!field && raw === undefined) continue;
      // A part (one axis, one alignment, one font-style flag; or the y a plain number edits of a point): merged into
      // what changed so far, else the loaded value.
      const part: PartKind | undefined = named ?? (Array.isArray(raw) ? 'y' : undefined);
      if (part && raw !== undefined) {
        changed[base] = mergePart(changed[base] ?? raw, part, value);
        continue;
      }
      changed[base] = field ? fromDisplay(field, value, loaded[key]) : rawFromDisplay(value, raw);
    }
    // MuseScore pairs the text font with the music font, unless the text font was chosen too.
    if (typeof changed.musicalSymbolFont === 'string' && !('musicalTextFont' in changed)) {
      changed.musicalTextFont = textFontFor(changed.musicalSymbolFont);
    }
    if (!Object.keys(changed).length) return true;
    return Boolean(await engine.setStyleValues(changed));
  },
};
