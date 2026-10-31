/**
 * Typed notation properties for the Properties panel (roadmap E09, with E07 dynamics and E10 ornaments). Each entry
 * names a MuseScore element property (its engine name) and the values a control offers, as the engine's own tokens,
 * so no version-specific numeric enum reaches the UI. The engine reports each property's value and style default
 * for the selection (`getElementPropertyValues`), and only the properties the selection has are shown.
 */

/** Shown only while another property of the selection does not have this value (frame details without a frame). */
export interface PropertyCondition {
  readonly hiddenWhen?: { readonly name: string; readonly value: string };
}

export type NotationPropertyDescriptor = PropertyCondition &
  (
    | { readonly name: string; readonly label: string; readonly kind: 'boolean' }
    | {
        readonly name: string;
        readonly label: string;
        readonly kind: 'select';
        readonly options: readonly { readonly value: string; readonly label: string }[];
      }
    /** An ornament interval: a step and a quality, joined as the engine writes them ("third,minor"). */
    | { readonly name: string; readonly label: string; readonly kind: 'interval' }
    /** A number the engine writes as a decimal token (a size, a length in spatium). */
    | {
        readonly name: string;
        readonly label: string;
        readonly kind: 'number';
        readonly min: number;
        readonly max: number;
        readonly step: number;
        readonly unit?: string;
      }
    /** Free text the engine writes as is (a font family), committed on Enter or blur; `suggestions` fill a list. */
    | {
        readonly name: string;
        readonly label: string;
        readonly kind: 'text';
        readonly suggestions?: readonly string[];
      }
    /** A colour token "#RRGGBBAA": the picker edits the RGB and keeps the alpha. */
    | { readonly name: string; readonly label: string; readonly kind: 'color' }
    /** MuseScore's font style flags (FontStyle: bold 1, italic 2, underline 4, strikethrough 8) as toggles. */
    | { readonly name: string; readonly label: string; readonly kind: 'fontStyle' }
    /** A text alignment, "horizontal,vertical" ("center,top"), as two choices. */
    | { readonly name: string; readonly label: string; readonly kind: 'align' }
    /** The element's text style ("staff", "title"…), offered from the score's own list (getTextStyleCatalog). */
    | { readonly name: string; readonly label: string; readonly kind: 'textStyle' }
  );

const AUTO_ON_OFF = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const VOICE_ASSIGNMENT = [
  { value: 'allInInstrument', label: 'All staves of the instrument' },
  { value: 'allInStaff', label: 'All voices on this staff' },
  { value: 'currentVoiceOnly', label: 'This voice only' },
];

export const INTERVAL_STEPS = [
  'unison',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'octave',
] as const;
export const INTERVAL_TYPES = [
  'auto',
  'minor',
  'major',
  'perfect',
  'diminished',
  'augmented',
] as const;

/** By the engine's element type name, as the Properties panel's selection reports it. */
export const NOTATION_PROPERTIES: Readonly<
  Record<
    string,
    { readonly title: string; readonly properties: readonly NotationPropertyDescriptor[] }
  >
> = {
  Ornament: {
    title: 'Ornament',
    properties: [
      { name: 'intervalAbove', label: 'Interval above', kind: 'interval' },
      { name: 'intervalBelow', label: 'Interval below', kind: 'interval' },
      {
        name: 'ornamentShowAccidental',
        label: 'Show accidental',
        kind: 'select',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'anyAlteration', label: 'Any alteration' },
          { value: 'always', label: 'Always' },
        ],
      },
      { name: 'ornamentShowCueNote', label: 'Show cue note', kind: 'select', options: AUTO_ON_OFF },
      { name: 'startOnUpperNote', label: 'Start on upper note', kind: 'boolean' },
      { name: 'play', label: 'Play', kind: 'boolean' },
    ],
  },
  // Tremolo type and stroke style are plain integers in the engine (TremoloType, TremoloStyle); their meanings
  // live here only, labelled, so the panel still shows names.
  TremoloSingleChord: {
    title: 'Tremolo',
    properties: [
      {
        name: 'subtype',
        label: 'Type',
        kind: 'select',
        options: [
          { value: '0', label: 'Eighth' },
          { value: '1', label: '16th' },
          { value: '2', label: '32nd' },
          { value: '3', label: '64th' },
          { value: '4', label: 'Buzz roll' },
        ],
      },
      { name: 'play', label: 'Play', kind: 'boolean' },
    ],
  },
  TremoloTwoChord: {
    title: 'Two-note tremolo',
    properties: [
      {
        name: 'subtype',
        label: 'Type',
        kind: 'select',
        options: [
          { value: '5', label: 'Eighth' },
          { value: '6', label: '16th' },
          { value: '7', label: '32nd' },
          { value: '8', label: '64th' },
        ],
      },
      {
        name: 'strokeStyle',
        label: 'Stroke style (half notes)',
        kind: 'select',
        options: [
          { value: '0', label: 'Default' },
          { value: '1', label: 'Traditional' },
          { value: '2', label: 'Traditional alternate' },
        ],
      },
      { name: 'play', label: 'Play', kind: 'boolean' },
    ],
  },
  Dynamic: {
    title: 'Dynamic',
    properties: [
      { name: 'voiceAssignment', label: 'Applies to', kind: 'select', options: VOICE_ASSIGNMENT },
      {
        name: 'centerBetweenStaves',
        label: 'Center between staves',
        kind: 'select',
        options: AUTO_ON_OFF,
      },
      { name: 'centerOnNotehead', label: 'Align with notehead', kind: 'boolean' },
      { name: 'anchorToEndOfPrevious', label: 'Anchor to end of previous', kind: 'boolean' },
      { name: 'avoidBarlines', label: 'Avoid barlines', kind: 'boolean' },
      { name: 'velocity', label: 'Playback velocity', kind: 'number', min: 0, max: 127, step: 1 },
    ],
  },
  Tie: {
    title: 'Tie',
    properties: [
      {
        name: 'tiePlacement',
        label: 'Placement',
        kind: 'select',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'inside', label: 'Inside' },
          { value: 'outside', label: 'Outside' },
        ],
      },
    ],
  },
  LaissezVib: {
    title: 'Laissez vibrer',
    properties: [
      {
        name: 'tiePlacement',
        label: 'Placement',
        kind: 'select',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'inside', label: 'Inside' },
          { value: 'outside', label: 'Outside' },
        ],
      },
      {
        name: 'minLength',
        label: 'Minimum length',
        kind: 'number',
        min: 0,
        max: 20,
        step: 0.1,
        unit: 'sp',
      },
    ],
  },
  // Roadmap E15: feathered beams (each end's spacing as a multiple of normal) and a flat beam.
  Beam: {
    title: 'Beam',
    properties: [
      {
        name: 'growLeft',
        label: 'Feathering, left end',
        kind: 'number',
        min: 0,
        max: 4,
        step: 0.1,
        unit: '×',
      },
      {
        name: 'growRight',
        label: 'Feathering, right end',
        kind: 'number',
        min: 0,
        max: 4,
        step: 0.1,
        unit: '×',
      },
      { name: 'noSlope', label: 'Force horizontal', kind: 'boolean' },
    ],
  },
  Hairpin: {
    title: 'Hairpin',
    properties: [
      { name: 'voiceAssignment', label: 'Applies to', kind: 'select', options: VOICE_ASSIGNMENT },
      {
        name: 'centerBetweenStaves',
        label: 'Center between staves',
        kind: 'select',
        options: AUTO_ON_OFF,
      },
    ],
  },
};

/** Fonts OTS ships for scores (the engine's text fonts and each music font's text companion). */
const TEXT_FONTS = [
  'Edwin',
  'FreeSerif',
  'FreeSans',
  'MScore Text',
  'Leland Text',
  'Bravura Text',
  'Gonville Text',
  'MuseJazz Text',
  'Petaluma Text',
  'Finale Maestro Text',
  'Finale Broadway Text',
];

/** Frame details apply once a text has a frame (MuseScore hides them for "None"). */
const NO_FRAME = { name: 'frameType', value: '0' };

/**
 * Any text's properties, as MuseScore's inspector Text section offers them: shown for whatever the selection has
 * (staff and system text, tempo, titles, dynamics, lyrics, fingering, rehearsal marks…), each resettable to its text
 * style. Colour is in the general properties.
 */
export const TEXT_PROPERTIES: {
  readonly title: string;
  readonly properties: readonly NotationPropertyDescriptor[];
} = {
  title: 'Text',
  properties: [
    { name: 'style', label: 'Text style', kind: 'textStyle' },
    { name: 'family', label: 'Font', kind: 'text', suggestions: TEXT_FONTS },
    { name: 'size', label: 'Size', kind: 'number', min: 1, max: 1000, step: 0.5, unit: 'pt' },
    { name: 'fontStyle', label: 'Style', kind: 'fontStyle' },
    { name: 'sizeIsSpatiumDependent', label: 'Follow staff size', kind: 'boolean' },
    { name: 'align', label: 'Alignment', kind: 'align' },
    {
      name: 'position',
      label: 'Position',
      kind: 'select',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' },
      ],
    },
    {
      name: 'textLineSpacing',
      label: 'Line spacing',
      kind: 'number',
      min: 0.1,
      max: 10,
      step: 0.1,
    },
    {
      name: 'musicSymbolSize',
      label: 'Musical symbol size',
      kind: 'number',
      min: 1,
      max: 1000,
      step: 0.5,
      unit: 'pt',
    },
    {
      name: 'frameType',
      label: 'Frame',
      kind: 'select',
      options: [
        { value: '0', label: 'None' },
        { value: '1', label: 'Rectangle' },
        { value: '2', label: 'Circle' },
      ],
    },
    { hiddenWhen: NO_FRAME, name: 'frameFgColor', label: 'Border', kind: 'color' },
    { hiddenWhen: NO_FRAME, name: 'frameBgColor', label: 'Highlight', kind: 'color' },
    {
      hiddenWhen: NO_FRAME,
      name: 'frameWidth',
      label: 'Border thickness',
      kind: 'number',
      min: 0,
      max: 5,
      step: 0.05,
      unit: 'sp',
    },
    {
      hiddenWhen: NO_FRAME,
      name: 'framePadding',
      label: 'Padding',
      kind: 'number',
      min: 0,
      max: 5,
      step: 0.05,
      unit: 'sp',
    },
    {
      hiddenWhen: NO_FRAME,
      name: 'frameRound',
      label: 'Corner radius',
      kind: 'number',
      min: 0,
      max: 5,
      step: 0.1,
      unit: 'sp',
    },
  ],
};
export const TEXT_PROPERTY_NAMES = TEXT_PROPERTIES.properties.map((p) => p.name);

/** FontStyle's flags, in MuseScore's button order. */
export const FONT_STYLE_FLAGS = [
  { bit: 1, label: 'Bold', short: 'B' },
  { bit: 2, label: 'Italic', short: 'I' },
  { bit: 4, label: 'Underline', short: 'U' },
  { bit: 8, label: 'Strikethrough', short: 'S' },
] as const;
export const ALIGN_HORIZONTAL = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
] as const;
export const ALIGN_VERTICAL = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Middle' },
  { value: 'baseline', label: 'Baseline' },
  { value: 'bottom', label: 'Bottom' },
] as const;

/** The property names to ask the engine about for a selection of `elementType`. */
export const notationPropertyNames = (elementType: string | null | undefined): string[] =>
  (elementType && NOTATION_PROPERTIES[elementType]?.properties.map((p) => p.name)) || [];

/** Splits an ornament interval token; unknown parts fall back to the first choice. */
export function splitInterval(token: string | null): { step: string; type: string } {
  const [step, type] = (token ?? '').split(',');
  return {
    step: (INTERVAL_STEPS as readonly string[]).includes(step) ? step : 'second',
    type: (INTERVAL_TYPES as readonly string[]).includes(type) ? type : 'auto',
  };
}
