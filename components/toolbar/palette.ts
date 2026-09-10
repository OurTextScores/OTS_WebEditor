import {
  articulationOptions,
  clefButtonOptionsDefault,
  dynamicOptions,
  hairpinOptions,
  pedalOptions,
  repeatCountOptions,
  barlineOptions,
  voltaOptions,
  accidentalOptions,
  graceNoteOptions,
  keySignatureButtonOptionsDefault,
  signatureOptionsDefault,
} from './constants';

export const SCORE_PALETTE_DRAG_MIME = 'application/x-ots-score-palette+json';

export type PaletteCategory =
  | 'Clefs'
  | 'Key Signatures'
  | 'Time Signatures'
  | 'Accidentals'
  | 'Grace Notes'
  | 'Dynamics'
  | 'Hairpins'
  | 'Pedals'
  | 'Articulations'
  | 'Fermatas'
  | 'Breaths'
  | 'Ottavas'
  | 'Trills'
  | 'Glissandos'
  | 'Arpeggios'
  | 'Tremolos'
  | 'Noteheads'
  | 'Beams'
  | 'Barlines'
  | 'Voltas'
  | 'Repeats'
  | 'Markers'
  | 'Jumps';

// Discriminates which editor action a palette item performs when applied.
export type PaletteKind =
  | 'clef'
  | 'keysig'
  | 'timesig'
  | 'accidental'
  | 'gracenote'
  | 'dynamic'
  | 'hairpin'
  | 'pedal'
  | 'articulation'
  | 'fermata'
  | 'breath'
  | 'ottava'
  | 'trill'
  | 'glissando'
  | 'arpeggio'
  | 'tremolo'
  | 'notehead'
  | 'beam'
  | 'barline'
  | 'volta'
  | 'repeat-start'
  | 'repeat-end'
  | 'repeat-count'
  | 'marker'
  | 'jump';

export type ScorePaletteItem = {
  label: string;
  symbol: string;
  category: PaletteCategory;
  kind: PaletteKind;
  subtype: number;
  // Extra positional args for actions that need more than a single value (e.g. time signatures).
  args?: number[];
  // Present only for kinds that support drag-and-drop onto the score
  // (the engine's applyDropAtPoint currently covers clefs/dynamics/articulations).
  elementType?: 0 | 1 | 2;
};

export type ScorePaletteMutation = {
  methodName: string;
  args: unknown[];
};

/** The editor command represented by a palette tile. */
export const scorePaletteMutation = (item: ScorePaletteItem): ScorePaletteMutation | null => {
  const simple: Partial<Record<PaletteKind, string>> = {
    clef: 'setClef',
    dynamic: 'addDynamic',
    ottava: 'addOttava',
    trill: 'addTrill',
    glissando: 'addGlissando',
    arpeggio: 'addArpeggio',
    fermata: 'addFermata',
    breath: 'addBreath',
    tremolo: 'addTremolo',
    marker: 'addMarker',
    jump: 'addJump',
    notehead: 'setNoteheadGroup',
    beam: 'setBeamMode',
    accidental: 'setAccidental',
    gracenote: 'addGraceNote',
    hairpin: 'addHairpin',
    pedal: 'addPedal',
    keysig: 'setKeySignature',
    barline: 'setBarLineType',
    volta: 'addVolta',
    'repeat-count': 'setRepeatCount',
  };
  if (item.kind === 'articulation') {
    const articulation = articulationOptions[item.subtype];
    return articulation ? { methodName: 'addArticulation', args: [articulation.symbol] } : null;
  }
  if (item.kind === 'timesig') {
    const [numerator, denominator, timeSigType] = item.args ?? [];
    if (!numerator || !denominator) return null;
    return typeof timeSigType === 'number'
      ? { methodName: 'setTimeSignatureWithType', args: [numerator, denominator, timeSigType] }
      : { methodName: 'setTimeSignature', args: [numerator, denominator] };
  }
  if (item.kind === 'repeat-start') return { methodName: 'toggleRepeatStart', args: [] };
  if (item.kind === 'repeat-end') return { methodName: 'toggleRepeatEnd', args: [] };
  const methodName = simple[item.kind];
  return methodName ? { methodName, args: [item.subtype] } : null;
};

type OptionInput = { label: string; value: number; symbol?: string; args?: number[] };

const makePaletteItems = (
  category: PaletteCategory,
  kind: PaletteKind,
  options: ReadonlyArray<OptionInput>,
): ScorePaletteItem[] =>
  options.map((option) => ({
    label: option.label,
    symbol: option.symbol ?? '',
    category,
    kind,
    subtype: option.value,
    ...(option.args ? { args: option.args } : {}),
  }));

// --- Clefs -----------------------------------------------------------------
const clefPaletteGlyph = (clefType: number): string => {
  const codepoints: Record<number, number> = {
    0: 0xe050,
    1: 0xe051,
    2: 0xe052,
    3: 0xe053,
    4: 0xe054,
    5: 0xe055,
    6: 0xe057,
    7: 0xe050,
    20: 0xe062,
    21: 0xe063,
    22: 0xe064,
    23: 0xe065,
    24: 0xe066,
    29: 0xe069,
    30: 0xe06a,
    31: 0xe06d,
    32: 0xe06e,
    33: 0xe06d,
    34: 0xe06e,
  };
  if (codepoints[clefType]) return String.fromCharCode(codepoints[clefType]);
  if (clefType >= 8 && clefType <= 19) return String.fromCharCode(0xe05c);
  if (clefType >= 20 && clefType <= 28) return String.fromCharCode(0xe062);
  return String.fromCharCode(0xe050);
};

const clefItems: ScorePaletteItem[] = clefButtonOptionsDefault.map((option) => ({
  label: `${option.label} clef`,
  symbol: clefPaletteGlyph(option.value),
  category: 'Clefs',
  kind: 'clef',
  subtype: option.value,
  elementType: 0,
}));

// --- Dynamics --------------------------------------------------------------
const dynamicGlyphs: Record<string, string> = {
  p: '',
  m: '',
  f: '',
  r: '',
  s: '',
  z: '',
  n: '',
};
const dynamicSymbolFor = (label: string) =>
  Array.from(label)
    .map((character) => dynamicGlyphs[character] ?? character)
    .join('');
const dynamicItems: ScorePaletteItem[] = dynamicOptions.map((option) => ({
  label: `${option.label} dynamic`,
  symbol: dynamicSymbolFor(option.label),
  category: 'Dynamics',
  kind: 'dynamic',
  subtype: option.value,
  elementType: 1,
}));

// --- Articulations ---------------------------------------------------------
const articulationGlyphs: Record<string, string> = {
  articStaccatoAbove: '',
  articTenutoAbove: '',
  articMarcatoAbove: '',
  articAccentAbove: '',
};
const articulationItems: ScorePaletteItem[] = articulationOptions.map((option, index) => ({
  label: option.label,
  symbol: articulationGlyphs[option.symbol] ?? '',
  category: 'Articulations',
  kind: 'articulation',
  subtype: index,
  elementType: 2,
}));

// --- Everything else -------------------------------------------------------
// Render the key's tonic with its accidental in the Leland notation font
// (e.g. "F#" → F + sharp glyph), mirroring the Key dropdown.
const KEYSIG_SHARP = String.fromCharCode(0xe262); // accidentalSharp
const KEYSIG_FLAT = String.fromCharCode(0xe260); // accidentalFlat
const keySigGlyph = (label: string): string =>
  label.replace(/#/g, KEYSIG_SHARP).replace(/b/g, KEYSIG_FLAT);
const keySignatureItems = makePaletteItems(
  'Key Signatures',
  'keysig',
  keySignatureButtonOptionsDefault.map((option) => ({
    label: `${option.label} major`,
    value: option.fifths,
    symbol: keySigGlyph(option.label),
  })),
);

// Common time (C) and cut time (¢) get their SMuFL glyphs; other meters stay numeric.
const timeSignatureGlyphs: Record<number, string> = {
  1: '', // timeSigCommon
  2: '', // timeSigCutCommon
};
const timeSignatureItems: ScorePaletteItem[] = signatureOptionsDefault.map((option) => ({
  label: option.label,
  symbol: timeSignatureGlyphs[option.timeSigType] ?? '',
  category: 'Time Signatures',
  kind: 'timesig',
  subtype: option.numerator,
  args: [option.numerator, option.denominator, option.timeSigType],
}));

const accidentalItems = makePaletteItems(
  'Accidentals',
  'accidental',
  accidentalOptions
    .filter((option) => option.value !== 0)
    .map((option) => ({ label: option.name, value: option.value, symbol: option.symbol })),
);

// Slashed/plain grace-note heads for acciaccatura/appoggiatura; metronome note
// glyphs stand in for the duration-typed grace notes.
const graceNoteGlyphs: Record<number, string> = {
  1: '', // graceNoteAcciaccaturaStemUp
  2: '', // graceNoteAppoggiaturaStemUp
  8: '', // metNote16thUp
  16: '', // metNote32ndUp
  32: '', // metNote8thUp
  64: '', // metNote16thUp
  128: '', // metNote32ndUp
};
const graceNoteItems = makePaletteItems(
  'Grace Notes',
  'gracenote',
  graceNoteOptions.map((option) => ({
    label: option.label,
    value: option.value,
    symbol: graceNoteGlyphs[option.value],
  })),
);

const hairpinGlyphs: Record<number, string> = {
  0: '', // dynamicCrescendoHairpin
  1: '', // dynamicDiminuendoHairpin
};
const hairpinItems = makePaletteItems(
  'Hairpins',
  'hairpin',
  hairpinOptions.map((option) => ({
    label: option.label,
    value: option.value,
    symbol: hairpinGlyphs[option.value],
  })),
);

const pedalItems = makePaletteItems(
  'Pedals',
  'pedal',
  pedalOptions.map((option) => ({ label: option.label, value: option.value })),
);

const fermataItems = makePaletteItems('Fermatas', 'fermata', [
  { label: 'Fermata', value: 0, symbol: '' },
  { label: 'Short fermata', value: 1, symbol: '' },
  { label: 'Long fermata', value: 2, symbol: '' },
  { label: 'Very short fermata', value: 3, symbol: '' },
  { label: 'Very long fermata', value: 4, symbol: '' },
]);

const breathItems = makePaletteItems('Breaths', 'breath', [
  { label: 'Breath mark', value: 0, symbol: '' },
  { label: 'Caesura', value: 5, symbol: '' },
  { label: 'Tick breath mark', value: 1, symbol: '' },
  { label: 'Salzedo breath mark', value: 2, symbol: '' },
  { label: 'Upbow breath mark', value: 3, symbol: '' },
  { label: 'Curved caesura', value: 4, symbol: '' },
  { label: 'Short caesura', value: 6, symbol: '' },
  { label: 'Thick caesura', value: 7, symbol: '' },
  { label: 'Chant caesura', value: 8, symbol: '' },
]);

const ottavaItems = makePaletteItems('Ottavas', 'ottava', [
  { label: '8va', value: 0, symbol: '' },
  { label: '8vb', value: 1, symbol: '' },
  { label: '15ma', value: 2, symbol: '' },
  { label: '15mb', value: 3, symbol: '' },
  { label: '22ma', value: 4, symbol: '' },
  { label: '22mb', value: 5, symbol: '' },
]);

const trillItems = makePaletteItems('Trills', 'trill', [
  { label: 'Trill line', value: 0 },
  { label: 'Up-prall line', value: 1 },
  { label: 'Down-prall line', value: 2 },
  { label: 'Prall-prall line', value: 3 },
]);

const glissandoItems = makePaletteItems('Glissandos', 'glissando', [
  { label: 'Straight glissando', value: 0, symbol: '' },
  { label: 'Wavy glissando', value: 1, symbol: '' },
]);

const arpeggioItems = makePaletteItems('Arpeggios', 'arpeggio', [
  { label: 'Arpeggio', value: 0, symbol: '' },
  { label: 'Arpeggio up', value: 1, symbol: '' },
  { label: 'Arpeggio down', value: 2, symbol: '' },
  { label: 'Arpeggio bracket', value: 3, symbol: '' },
]);

const tremoloItems = makePaletteItems('Tremolos', 'tremolo', [
  { label: 'Eighth-note tremolo', value: 0, symbol: '' },
  { label: '16th-note tremolo', value: 1, symbol: '' },
  { label: '32nd-note tremolo', value: 2, symbol: '' },
  { label: '64th-note tremolo', value: 3, symbol: '' },
  { label: 'Buzz roll', value: 4, symbol: '' },
  { label: 'Two-note eighth tremolo', value: 5, symbol: '' },
  { label: 'Two-note 16th tremolo', value: 6, symbol: '' },
  { label: 'Two-note 32nd tremolo', value: 7, symbol: '' },
  { label: 'Two-note 64th tremolo', value: 8, symbol: '' },
]);

const noteheadItems = makePaletteItems('Noteheads', 'notehead', [
  { label: 'Normal', value: 0, symbol: '' },
  { label: 'Cross', value: 1, symbol: '' },
  { label: 'Diamond', value: 9, symbol: '' },
  { label: 'Triangle', value: 5, symbol: '' },
  { label: 'Slash', value: 15, symbol: '' },
]);

const beamItems = makePaletteItems('Beams', 'beam', [
  { label: 'Auto beam', value: 0 },
  { label: 'Begin beam / break left', value: 2 },
  { label: 'Join beams', value: 6 },
  { label: 'No beam', value: 1 },
  { label: 'Break secondary beam at eighth', value: 3 },
  { label: 'Break secondary beam at 16th', value: 4 },
]);

// SMuFL barline glyphs keyed by BarLineType.
const barlineGlyphCodes: Record<number, number> = {
  1: 0xe030, // barlineSingle
  2: 0xe031, // barlineDouble
  32: 0xe032, // barlineFinal
  512: 0xe034, // barlineHeavy
  1024: 0xe035, // barlineHeavyHeavy
  16: 0xe036, // barlineDashed
  128: 0xe037, // barlineDotted
  256: 0xe033, // barlineReverseFinal
};
export const barlineGlyph = (value: number): string =>
  barlineGlyphCodes[value] ? String.fromCharCode(barlineGlyphCodes[value]) : '';
const barlineItems = makePaletteItems(
  'Barlines',
  'barline',
  barlineOptions.map((option) => ({
    label: `${option.label} barline`,
    value: option.value,
    symbol: barlineGlyph(option.value),
  })),
);

const voltaItems = makePaletteItems(
  'Voltas',
  'volta',
  voltaOptions.map((option) => ({ label: option.label, value: option.ending })),
);

const repeatItems: ScorePaletteItem[] = [
  {
    label: 'Start repeat',
    symbol: String.fromCharCode(0xe040),
    category: 'Repeats',
    kind: 'repeat-start',
    subtype: 0,
  },
  {
    label: 'End repeat',
    symbol: String.fromCharCode(0xe041),
    category: 'Repeats',
    kind: 'repeat-end',
    subtype: 0,
  },
  ...makePaletteItems(
    'Repeats',
    'repeat-count',
    repeatCountOptions.map((option) => ({ label: `Repeat ${option.label}`, value: option.count })),
  ),
];

const markerItems = makePaletteItems('Markers', 'marker', [
  { label: 'Segno', value: 0, symbol: '' },
  { label: 'Coda', value: 2, symbol: '' },
  { label: 'Fine', value: 5, symbol: 'Fine' },
  { label: 'To Coda', value: 6, symbol: '' },
  { label: 'Serpent segno', value: 1, symbol: '' },
  { label: 'Square coda', value: 3, symbol: '' },
  { label: 'To Coda symbol', value: 7, symbol: '' },
]);

const jumpItems = makePaletteItems('Jumps', 'jump', [
  { label: 'D.C.', value: 0 },
  { label: 'D.C. al Fine', value: 1 },
  { label: 'D.C. al Coda', value: 2 },
  { label: 'D.S. al Coda', value: 3 },
  { label: 'D.S. al Fine', value: 4 },
  { label: 'D.S.', value: 5 },
  { label: 'D.C. al Double Coda', value: 6 },
  { label: 'D.S. al Double Coda', value: 7 },
  { label: 'Dal Segno Segno', value: 8 },
  { label: 'D.S.S. al Coda', value: 9 },
  { label: 'D.S.S. al Double Coda', value: 10 },
  { label: 'D.S.S. al Fine', value: 11 },
  { label: 'Da Coda', value: 12 },
  { label: 'Da Double Coda', value: 13 },
]);

// Order controls how categories appear in the full palette.
export const scorePaletteItems: ScorePaletteItem[] = [
  ...clefItems,
  ...keySignatureItems,
  ...timeSignatureItems,
  ...accidentalItems,
  ...graceNoteItems,
  ...dynamicItems,
  ...hairpinItems,
  ...pedalItems,
  ...articulationItems,
  ...fermataItems,
  ...breathItems,
  ...ottavaItems,
  ...trillItems,
  ...glissandoItems,
  ...arpeggioItems,
  ...tremoloItems,
  ...noteheadItems,
  ...beamItems,
  ...barlineItems,
  ...voltaItems,
  ...repeatItems,
  ...markerItems,
  ...jumpItems,
];

export const dynamicScorePaletteItem = (
  label: string,
  symbol: string,
  subtype: number,
): ScorePaletteItem => ({
  label: `${label} dynamic`,
  symbol,
  category: 'Dynamics',
  kind: 'dynamic',
  elementType: 1,
  subtype,
});

export const clefScorePaletteItem = (label: string, subtype: number): ScorePaletteItem => ({
  label: `${label} clef`,
  symbol: clefPaletteGlyph(subtype),
  category: 'Clefs',
  kind: 'clef',
  elementType: 0,
  subtype,
});

export const articulationScorePaletteItem = (label: string, subtype: number): ScorePaletteItem => ({
  label,
  symbol: '',
  category: 'Articulations',
  kind: 'articulation',
  elementType: 2,
  subtype,
});

export const parseScorePaletteItem = (raw: string): ScorePaletteItem | null => {
  try {
    const value = JSON.parse(raw) as Partial<ScorePaletteItem>;
    const match = scorePaletteItems.find(
      (item) =>
        item.elementType === value.elementType &&
        item.subtype === value.subtype &&
        value.elementType !== undefined,
    );
    if (match) {
      return match;
    }
    if (value.elementType === 0) {
      const clef = clefButtonOptionsDefault.find((option) => option.value === value.subtype);
      if (clef) {
        return clefScorePaletteItem(clef.label, clef.value);
      }
    }
    if (value.elementType === 1) {
      const dynamic = dynamicOptions.find((option) => option.value === value.subtype);
      if (dynamic) {
        return dynamicScorePaletteItem(
          dynamic.label,
          typeof value.symbol === 'string' ? value.symbol : '',
          dynamic.value,
        );
      }
    }
    if (value.elementType === 2 && typeof value.subtype === 'number') {
      const articulation = articulationOptions[value.subtype];
      if (articulation) {
        return articulationScorePaletteItem(articulation.label, value.subtype);
      }
    }
    return null;
  } catch {
    return null;
  }
};
