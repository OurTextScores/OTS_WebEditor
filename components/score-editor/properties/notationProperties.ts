/**
 * Typed notation properties for the Properties panel (roadmap E09, with E07 dynamics and E10 ornaments). Each entry
 * names a MuseScore element property (its engine name) and the values a control offers, as the engine's own tokens,
 * so no version-specific numeric enum reaches the UI. The engine reports each property's value and style default
 * for the selection (`getElementPropertyValues`), and only the properties the selection has are shown.
 */

export type NotationPropertyDescriptor =
  | { readonly name: string; readonly label: string; readonly kind: 'boolean' }
  | {
      readonly name: string;
      readonly label: string;
      readonly kind: 'select';
      readonly options: readonly { readonly value: string; readonly label: string }[];
    }
  /** An ornament interval: a step and a quality, joined as the engine writes them ("third,minor"). */
  | { readonly name: string; readonly label: string; readonly kind: 'interval' };

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

export const INTERVAL_STEPS = ['unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave'] as const;
export const INTERVAL_TYPES = ['auto', 'minor', 'major', 'perfect', 'diminished', 'augmented'] as const;

/** By the engine's element type name, as the Properties panel's selection reports it. */
export const NOTATION_PROPERTIES: Readonly<Record<string, { readonly title: string; readonly properties: readonly NotationPropertyDescriptor[] }>> = {
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
      { name: 'centerBetweenStaves', label: 'Center between staves', kind: 'select', options: AUTO_ON_OFF },
      { name: 'centerOnNotehead', label: 'Align with notehead', kind: 'boolean' },
      { name: 'anchorToEndOfPrevious', label: 'Anchor to end of previous', kind: 'boolean' },
    ],
  },
  Hairpin: {
    title: 'Hairpin',
    properties: [
      { name: 'voiceAssignment', label: 'Applies to', kind: 'select', options: VOICE_ASSIGNMENT },
      { name: 'centerBetweenStaves', label: 'Center between staves', kind: 'select', options: AUTO_ON_OFF },
    ],
  },
};

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
