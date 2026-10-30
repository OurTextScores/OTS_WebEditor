import type { StyleValue } from '../../../lib/webmscore-loader';
import type { DialogField, DialogSpec, FieldValue } from './dialogSpecs';
import generated from './style-pages.generated.json';

/**
 * MuseScore's Style dialog (roadmap E08), page by page in MuseScore's order. The pages MuseScore builds from widgets
 * are generated from its editstyle.{cpp,ui} (tools/musescore/gen-style-dialog-pages.mjs); the pages it builds in QML
 * are written here, with the settings OTS has reviewed so far. Only the keys this engine knows are shown, and each
 * setting can be reset to MuseScore's default.
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
  kind: 'boolean' | 'number' | 'select' | 'text';
  label: string;
  group?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** MuseScore shows the stored fraction as a percentage. */
  percent?: boolean;
  options?: { value: number | string; label: string }[];
}
interface StylePage {
  code: string;
  title: string;
  fields: StyleFieldSpec[];
}

/** MuseScore's pages in its order (ALL_PAGE_CODES); a page with nothing this engine offers is left out. */
const PAGE_ORDER = [
  'score',
  'spacing',
  'sizes',
  'header-and-footer',
  'measure-number',
  'system',
  'clefs-key-and-time-signatures',
  'accidentals',
  'barlines',
  'notes',
  'rests',
  'repeats',
  'beams',
  'tuplets',
  'arpeggios',
  'chord-brackets',
  'slurs-ties',
  'dynamics-hairpins',
  'volta',
  'ottava',
  'pedal',
  'trill',
  'vibrato',
  'glissando-note-line',
  'bend',
  'text-line',
  'system-text-line',
  'articulations-and-ornaments',
  'hammer-ons-pull-offs-and-tapping',
  'fermatas',
  'staff-text',
  'tempo-text',
  'lyrics',
  'expression',
  'rehearsal-marks',
  'figured-bass',
  'chord-symbols',
  'fretboard-diagrams',
  'tablature-styles',
  'text-styles',
];

/** Pages MuseScore draws in QML, with the settings reviewed so far (E12, E13, E16). */
const QML_PAGES: StylePage[] = [
  {
    code: 'measure-number',
    title: 'Measure numbers',
    fields: [
      { kind: 'boolean', key: 'showMeasureNumber', label: 'Show measure numbers' },
      { kind: 'boolean', key: 'showMeasureNumberOne', label: 'Number the first measure' },
      { kind: 'boolean', key: 'measureNumberSystem', label: 'At the start of every system' },
      {
        kind: 'number',
        key: 'measureNumberInterval',
        label: 'Every n measures (when not per system)',
        min: 1,
        max: 99,
        step: 1,
      },
    ],
  },
  {
    code: 'clefs-key-and-time-signatures',
    title: 'Clefs, key & time signatures',
    fields: [
      {
        kind: 'boolean',
        key: 'genCourtesyTimesig',
        label: 'Courtesy time signatures',
        group: 'Courtesy signs',
      },
      {
        kind: 'boolean',
        key: 'genCourtesyKeysig',
        label: 'Courtesy key signatures',
        group: 'Courtesy signs',
      },
      { kind: 'boolean', key: 'genCourtesyClef', label: 'Courtesy clefs', group: 'Courtesy signs' },
    ],
  },
  {
    code: 'chord-symbols',
    title: 'Chord symbols',
    fields: [
      { kind: 'boolean', key: 'verticallyStackModifiers', label: 'Stack modifiers vertically' },
      {
        kind: 'number',
        key: 'chordStackedModifierMag',
        label: 'Stacked modifier size',
        min: 0.1,
        max: 5,
        step: 0.05,
      },
      { kind: 'boolean', key: 'chordBassNoteStagger', label: 'Stagger the bass note' },
      {
        kind: 'number',
        key: 'chordModifierMag',
        label: 'Modifier size',
        min: 0.1,
        max: 5,
        step: 0.05,
      },
      { kind: 'boolean', key: 'lowerCaseMinorChords', label: 'Lower-case minor chords' },
      { kind: 'boolean', key: 'lowerCaseBassNotes', label: 'Lower-case bass notes' },
      { kind: 'boolean', key: 'allCapsNoteNames', label: 'All-caps note names' },
      {
        kind: 'number',
        key: 'harmonyFretDist',
        label: 'Distance to fretboard diagram',
        min: 0,
        max: 99,
        step: 0.1,
        unit: 'sp',
      },
    ],
  },
];

/**
 * Keys MuseScore changes through a command rather than as a plain style value: concert pitch transposes the score
 * (Score::cmdConcertPitchChanged), which OTS does from its own concert-pitch toggle.
 */
const COMMAND_KEYS = new Set(['concertPitch']);

export const STYLE_PAGES: StylePage[] = [...(generated.pages as StylePage[]), ...QML_PAGES]
  .map((page) => ({ ...page, fields: page.fields.filter((f) => !COMMAND_KEYS.has(f.key)) }))
  .sort((a, b) => PAGE_ORDER.indexOf(a.code) - PAGE_ORDER.indexOf(b.code));

const ALL_FIELDS = STYLE_PAGES.flatMap((page) => page.fields);
const FIELD_BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));

/** The engine's value as the dialog shows it: percentages scaled, numbers rounded off float noise. */
function toDisplay(field: StyleFieldSpec, value: StyleValue): FieldValue {
  if (typeof value !== 'number') return value;
  const shown = field.percent ? value * 100 : value;
  return Math.round(shown * 1e6) / 1e6;
}
function fromDisplay(
  field: StyleFieldSpec,
  value: FieldValue,
  engineValue: StyleValue | undefined,
): StyleValue {
  // A choice is the engine's int, except for string-valued keys (font names).
  if (field.kind === 'select') return typeof engineValue !== 'string' && /^-?\d+$/.test(String(value)) ? Number(value) : value;
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
        fields.push(dialogField(field, raw[field.key]));
        values[field.key] = toDisplay(field, raw[field.key]);
        if (field.key in rawDefaults)
          defaults[field.key] = toDisplay(field, rawDefaults[field.key]);
      }
    }
    return { fields, values: { ...values, [LOADED]: JSON.stringify(values) }, defaults };
  },
  async apply(engine, values) {
    const loaded: Record<string, FieldValue> =
      typeof values[LOADED] === 'string' ? JSON.parse(values[LOADED]) : {};
    const changed: Record<string, StyleValue> = {};
    for (const [key, value] of Object.entries(values)) {
      const field = FIELD_BY_KEY.get(key);
      if (!field || (key in loaded && loaded[key] === value)) continue;
      changed[key] = fromDisplay(field, value, loaded[key]);
    }
    // MuseScore pairs the text font with the music font, unless the text font was chosen too.
    if (typeof changed.musicalSymbolFont === 'string' && !('musicalTextFont' in changed)) {
      changed.musicalTextFont = textFontFor(changed.musicalSymbolFont);
    }
    if (!Object.keys(changed).length) return true;
    return Boolean(await engine.setStyleValues(changed));
  },
};
