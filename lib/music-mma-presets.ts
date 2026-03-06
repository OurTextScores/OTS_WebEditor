export type MmaArrangementPreset =
  | 'full-groove'
  | 'piano-trio'
  | 'guitar-trio'
  | 'bass-drums'
  | 'piano-solo'
  | 'strings-pad';

export type MmaArrangementPresetOption = {
  id: MmaArrangementPreset;
  label: string;
  description: string;
};

export const MMA_ARRANGEMENT_PRESETS: MmaArrangementPresetOption[] = [
  {
    id: 'full-groove',
    label: 'Full Groove',
    description: 'Use the groove as-is with its default accompaniment layers.',
  },
  {
    id: 'piano-trio',
    label: 'Piano Trio',
    description: 'Piano comping with bass and drums; disables extra arpeggio/scale layers.',
  },
  {
    id: 'guitar-trio',
    label: 'Guitar Trio',
    description: 'Jazz guitar comping with bass and drums; disables extra arpeggio/scale layers.',
  },
  {
    id: 'bass-drums',
    label: 'Bass + Drums',
    description: 'Rhythm-section backing only, without chordal comping layers.',
  },
  {
    id: 'piano-solo',
    label: 'Piano Only',
    description: 'Single-instrument accompaniment with piano chordal support only.',
  },
  {
    id: 'strings-pad',
    label: 'Strings Pad',
    description: 'Sustained chord pad without rhythm section.',
  },
];

const DIRECTIVES_BY_PRESET: Record<MmaArrangementPreset, string[]> = {
  'full-groove': [],
  'piano-trio': [
    'AllTracks Chord Voice Piano1',
    'AllTracks Bass Walk Voice AcousticBass',
    'AllTracks Arpeggio Scale Off',
  ],
  'guitar-trio': [
    'AllTracks Chord Voice JazzGuitar',
    'AllTracks Bass Walk Voice AcousticBass',
    'AllTracks Arpeggio Scale Off',
  ],
  'bass-drums': [
    'AllTracks Chord Arpeggio Scale Off',
    'AllTracks Bass Walk Voice AcousticBass',
  ],
  'piano-solo': [
    'AllTracks Drum Off',
    'AllTracks Bass Walk Arpeggio Scale Off',
    'AllTracks Chord Voice Piano1',
  ],
  'strings-pad': [
    'AllTracks Drum Off',
    'AllTracks Bass Walk Arpeggio Scale Off',
    'AllTracks Chord Voice Strings',
  ],
};

export const isMmaArrangementPreset = (value: unknown): value is MmaArrangementPreset => (
  typeof value === 'string'
  && MMA_ARRANGEMENT_PRESETS.some((preset) => preset.id === value)
);

export const getMmaArrangementDirectives = (preset: MmaArrangementPreset): string[] => (
  [...DIRECTIVES_BY_PRESET[preset]]
);
