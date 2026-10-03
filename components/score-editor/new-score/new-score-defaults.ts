export const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const newScoreCommonInstrumentPreferences = [
  { key: 'piano', ids: ['piano'] },
  { key: 'violin', ids: ['violin'] },
  { key: 'viola', ids: ['viola'] },
  { key: 'cello', ids: ['violoncello', 'cello'] },
  { key: 'double-bass', ids: ['double-bass', 'contrabass'], label: 'Double Bass' },
  { key: 'flute', ids: ['flute'] },
  { key: 'oboe', ids: ['oboe'] },
  { key: 'clarinet', ids: ['clarinet'], label: 'Clarinet' },
  { key: 'bassoon', ids: ['bassoon'] },
  { key: 'trumpet', ids: ['trumpet'], label: 'Trumpet' },
  { key: 'horn', ids: ['horn'] },
  { key: 'trombone', ids: ['trombone'] },
  { key: 'tuba', ids: ['tuba'] },
  { key: 'alto-saxophone', ids: ['alto-saxophone'] },
  { key: 'tenor-saxophone', ids: ['tenor-saxophone'] },
  { key: 'bass-guitar', ids: ['bass-guitar'] },
  { key: 'guitar', ids: ['guitar-nylon', 'guitar-steel'] },
  { key: 'voice', ids: ['voice'] },
  { key: 'drumset', ids: ['drumset'] },
];

export const clefCodeMap: Record<string, { sign: string; line: number; octave?: number }> = {
  G: { sign: 'G', line: 2 },
  G8va: { sign: 'G', line: 2, octave: 1 },
  G8vb: { sign: 'G', line: 2, octave: -1 },
  G15ma: { sign: 'G', line: 2, octave: 2 },
  F: { sign: 'F', line: 4 },
  F8va: { sign: 'F', line: 4, octave: 1 },
  F8vb: { sign: 'F', line: 4, octave: -1 },
  F15ma: { sign: 'F', line: 4, octave: 2 },
  C1: { sign: 'C', line: 1 },
  C2: { sign: 'C', line: 2 },
  C3: { sign: 'C', line: 3 },
  C4: { sign: 'C', line: 4 },
  C5: { sign: 'C', line: 5 },
  PERC: { sign: 'percussion', line: 2 },
};

export const pickupDurationToRestType = (numerator: number, denominator: number): string => {
  // Map a simple pickup fraction to MusicXML <type> value.
  // For compound fractions (e.g. 3/8), use the denominator's base note type
  // with dots handled separately if needed. For the rest element, just using
  // the denominator's type with the correct duration value is sufficient —
  // MuseScore will display the correct rest(s) based on duration.
  const denomTypes: Record<number, string> = {
    1: 'whole',
    2: 'half',
    4: 'quarter',
    8: 'eighth',
    16: '16th',
    32: '32nd',
  };
  // Simple case: numerator is 1 → exact match
  if (numerator === 1) {
    return denomTypes[denominator] || 'quarter';
  }
  // Dotted: 3/8 = dotted quarter, 3/4 = dotted half, etc.
  if (numerator === 3) {
    const dottedDenom = denominator / 2;
    if (denomTypes[dottedDenom]) {
      return denomTypes[dottedDenom];
    }
  }
  // Fallback: use denominator type (MuseScore will use duration to fill correctly)
  return denomTypes[denominator] || 'quarter';
};
