export const toolbarInputBaseClass =
  'rounded border-0 bg-white px-2 py-0.5 text-xs font-medium leading-4 text-slate-800 shadow-sm ring-1 ring-slate-200 transition focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-500';

export const dropdownTextClass = 'px-2 py-1 text-xs font-medium leading-4 text-slate-800';

export const toolbarSectionLabelClass =
  'text-[10px] font-bold uppercase tracking-wider text-slate-800 mr-2 flex items-center cursor-grab active:cursor-grabbing';

export const toolbarSectionInnerClass = 'flex flex-wrap items-center gap-2 rounded px-2 py-0.5';

export const signatureOptionsDefault = [
  { label: 'Common time', numerator: 4, denominator: 4, timeSigType: 1 },
  { label: 'Cut time', numerator: 2, denominator: 2, timeSigType: 2 },
];

export const keySignatureButtonOptionsDefault = [
  { label: 'C', fifths: 0 },
  { label: 'G', fifths: 1 },
  { label: 'D', fifths: 2 },
  { label: 'A', fifths: 3 },
  { label: 'E', fifths: 4 },
  { label: 'B', fifths: 5 },
  { label: 'F#', fifths: 6 },
  { label: 'C#', fifths: 7 },
  { label: 'F', fifths: -1 },
  { label: 'Bb', fifths: -2 },
  { label: 'Eb', fifths: -3 },
  { label: 'Ab', fifths: -4 },
  { label: 'Db', fifths: -5 },
  { label: 'Gb', fifths: -6 },
  { label: 'Cb', fifths: -7 },
];

export const clefButtonOptionsDefault = [
  { label: 'Treble', value: 0 }, // ClefType::G
  { label: 'Bass', value: 20 }, // ClefType::F
  { label: 'French Violin', value: 7 }, // ClefType::G_1
  { label: 'Treble 15mb', value: 1 }, // ClefType::G15_MB
  { label: 'Treble 8vb', value: 2 }, // ClefType::G8_VB
  { label: 'Treble 8va', value: 3 }, // ClefType::G8_VA
  { label: 'Treble 15ma', value: 4 }, // ClefType::G15_MA
  { label: 'Treble 8vb (O)', value: 5 }, // ClefType::G8_VB_O
  { label: 'Treble 8vb (P)', value: 6 }, // ClefType::G8_VB_P
  { label: 'Soprano', value: 8 }, // ClefType::C1
  { label: 'Mezzo', value: 9 }, // ClefType::C2
  { label: 'Alto', value: 10 }, // ClefType::C3
  { label: 'Tenor', value: 11 }, // ClefType::C4
  { label: 'Baritone', value: 12 }, // ClefType::C5
  { label: 'C (19c)', value: 13 }, // ClefType::C_19C
  { label: 'C1 (F18c)', value: 14 }, // ClefType::C1_F18C
  { label: 'C3 (F18c)', value: 15 }, // ClefType::C3_F18C
  { label: 'C4 (F18c)', value: 16 }, // ClefType::C4_F18C
  { label: 'C1 (F20c)', value: 17 }, // ClefType::C1_F20C
  { label: 'C3 (F20c)', value: 18 }, // ClefType::C3_F20C
  { label: 'C4 (F20c)', value: 19 }, // ClefType::C4_F20C
  { label: 'Bass 15mb', value: 21 }, // ClefType::F15_MB
  { label: 'Bass 8vb', value: 22 }, // ClefType::F8_VB
  { label: 'Bass 8va', value: 23 }, // ClefType::F_8VA
  { label: 'Bass 15ma', value: 24 }, // ClefType::F_15MA
  { label: 'F (B)', value: 25 }, // ClefType::F_B
  { label: 'F (C)', value: 26 }, // ClefType::F_C
  { label: 'F (F18c)', value: 27 }, // ClefType::F_F18C
  { label: 'F (19c)', value: 28 }, // ClefType::F_19C
  { label: 'Perc', value: 29 }, // ClefType::PERC
  { label: 'Perc 2', value: 30 }, // ClefType::PERC2
  { label: 'TAB', value: 31 }, // ClefType::TAB
  { label: 'TAB4', value: 32 }, // ClefType::TAB4
  { label: 'TAB Serif', value: 33 }, // ClefType::TAB_SERIF
  { label: 'TAB4 Serif', value: 34 }, // ClefType::TAB4_SERIF
];

export const graceNoteOptions = [
  { label: 'Acciaccatura', value: 1, testId: 'btn-grace-acciaccatura' }, // NoteType::ACCIACCATURA
  { label: 'Appoggiatura', value: 2, testId: 'btn-grace-appoggiatura' }, // NoteType::APPOGGIATURA
  { label: 'Grace 16th', value: 8, testId: 'btn-grace-16' }, // NoteType::GRACE16
  { label: 'Grace 32nd', value: 16, testId: 'btn-grace-32' }, // NoteType::GRACE32
  { label: 'Grace 8th After', value: 32, testId: 'btn-grace-8-after' }, // NoteType::GRACE8_AFTER
  { label: 'Grace 16th After', value: 64, testId: 'btn-grace-16-after' }, // NoteType::GRACE16_AFTER
  { label: 'Grace 32nd After', value: 128, testId: 'btn-grace-32-after' }, // NoteType::GRACE32_AFTER
];

export const durationOptions = [
  { label: '32nd', value: 7, shortcut: '2', testId: 'btn-duration-32' }, // DurationType::V_32ND
  { label: '16th', value: 6, shortcut: '3', testId: 'btn-duration-16' }, // DurationType::V_16TH
  { label: '8th', value: 5, shortcut: '4', testId: 'btn-duration-8' }, // DurationType::V_EIGHTH
  { label: 'Quarter', value: 4, shortcut: '5', testId: 'btn-duration-4' }, // DurationType::V_QUARTER
  { label: 'Half', value: 3, shortcut: '6', testId: 'btn-duration-2' }, // DurationType::V_HALF
  { label: 'Whole', value: 2, shortcut: '7', testId: 'btn-duration-1' }, // DurationType::V_WHOLE
];

export const dynamicOptions = [
  { label: 'p', value: 6 }, // DynamicType::P
  { label: 'mp', value: 7 }, // DynamicType::MP
  { label: 'mf', value: 8 }, // DynamicType::MF
  { label: 'f', value: 9 }, // DynamicType::F
  { label: 'pp', value: 5 }, // DynamicType::PP
  { label: 'ff', value: 10 }, // DynamicType::FF
  { label: 'ppp', value: 4 }, // DynamicType::PPP
  { label: 'fff', value: 11 }, // DynamicType::FFF
  { label: 'pppp', value: 3 }, // DynamicType::PPPP
  { label: 'ffff', value: 12 }, // DynamicType::FFFF
  { label: 'ppppp', value: 2 }, // DynamicType::PPPPP
  { label: 'fffff', value: 13 }, // DynamicType::FFFFF
  { label: 'pppppp', value: 1 }, // DynamicType::PPPPPP
  { label: 'ffffff', value: 14 }, // DynamicType::FFFFFF
  { label: 'fp', value: 15 }, // DynamicType::FP
  { label: 'pf', value: 16 }, // DynamicType::PF
  { label: 'sf', value: 17 }, // DynamicType::SF
  { label: 'sfz', value: 18 }, // DynamicType::SFZ
  { label: 'sff', value: 19 }, // DynamicType::SFF
  { label: 'sffz', value: 20 }, // DynamicType::SFFZ
  { label: 'sfp', value: 21 }, // DynamicType::SFP
  { label: 'sfpp', value: 22 }, // DynamicType::SFPP
  { label: 'rfz', value: 23 }, // DynamicType::RFZ
  { label: 'rf', value: 24 }, // DynamicType::RF
  { label: 'fz', value: 25 }, // DynamicType::FZ
  { label: 'm', value: 26 }, // DynamicType::M
  { label: 'r', value: 27 }, // DynamicType::R
  { label: 's', value: 28 }, // DynamicType::S
  { label: 'z', value: 29 }, // DynamicType::Z
  { label: 'n', value: 30 }, // DynamicType::N
];

export const hairpinOptions = [
  { label: 'Crescendo', value: 0, testId: 'btn-hairpin-cresc' }, // HairpinType::CRESC_HAIRPIN
  { label: 'Decrescendo', value: 1, testId: 'btn-hairpin-decresc' }, // HairpinType::DECRESC_HAIRPIN
];

export const pedalOptions = [
  { label: 'Pedal Line', value: 0, testId: 'btn-pedal-line' },
  { label: 'Ped. *', value: 1, testId: 'btn-pedal-text' },
];

export const articulationOptions = [
  { label: 'Staccato', symbol: 'articStaccatoAbove' },
  { label: 'Tenuto', symbol: 'articTenutoAbove' },
  { label: 'Marcato', symbol: 'articMarcatoAbove' },
  { label: 'Accent', symbol: 'articAccentAbove' },
];

export const tupletOptions = [
  { label: 'Duplet', count: 2 },
  { label: 'Triplet', count: 3 },
  { label: 'Quintuplet', count: 5 },
  { label: 'Sextuplet', count: 6 },
  { label: 'Septuplet', count: 7 },
  { label: 'Octuplet', count: 8 },
];

export const repeatCountOptions = [
  { label: '2x', count: 2 },
  { label: '3x', count: 3 },
  { label: '4x', count: 4 },
];

export const barlineOptions = [
  { label: 'Normal', value: 1 }, // BarLineType::NORMAL
  { label: 'Double', value: 2 }, // BarLineType::DOUBLE
  { label: 'Final', value: 32 }, // BarLineType::END
  { label: 'Heavy', value: 512 }, // BarLineType::HEAVY
  { label: 'Heavy-Heavy', value: 1024 }, // BarLineType::DOUBLE_HEAVY
  { label: 'Dashed', value: 16 }, // BarLineType::BROKEN
  { label: 'Dotted', value: 128 }, // BarLineType::DOTTED
  { label: 'Reverse Final', value: 256 }, // BarLineType::REVERSE_END
];

export const voltaOptions = [
  { label: '1st Ending', ending: 1 },
  { label: '2nd Ending', ending: 2 },
];

export const accidentalOptions = [
  { name: 'Sharp', symbol: '', value: 3 }, // AccidentalType::SHARP (SMuFL accidentalSharp)
  { name: 'Flat', symbol: '', value: 1 }, // AccidentalType::FLAT (accidentalFlat)
  { name: 'Natural', symbol: '', value: 2 }, // AccidentalType::NATURAL (accidentalNatural)
  { name: 'Double sharp', symbol: '', value: 4 }, // AccidentalType::SHARP2 (accidentalDoubleSharp)
  { name: 'Double flat', symbol: '', value: 5 }, // AccidentalType::FLAT2 (accidentalDoubleFlat)
  { name: 'Clear', symbol: '', value: 0 }, // AccidentalType::NONE
];

export const markerOptions = [
  { label: 'Segno', value: 0, symbol: '\uE047', common: true },
  { label: 'Coda', value: 2, symbol: '\uE048', common: true },
  { label: 'Fine', value: 5, symbol: 'Fine', common: true },
  { label: 'To Coda', value: 6, symbol: '\uE048', common: true },
  { label: 'Serpent segno', value: 1, symbol: '\uE04A', common: false },
  { label: 'Square coda', value: 3, symbol: '\uE049', common: false },
  { label: 'To Coda symbol', value: 7, symbol: '\uE048', common: false },
] as const;

export const jumpOptions = [
  { label: 'D.C.', value: 0, common: true },
  { label: 'D.C. al Fine', value: 1, common: true },
  { label: 'D.C. al Coda', value: 2, common: true },
  { label: 'D.S. al Coda', value: 3, common: true },
  { label: 'D.S. al Fine', value: 4, common: true },
  { label: 'D.S.', value: 5, common: true },
  { label: 'D.C. al Double Coda', value: 6, common: false },
  { label: 'D.S. al Double Coda', value: 7, common: false },
  { label: 'Dal Segno Segno', value: 8, common: false },
  { label: 'D.S.S. al Coda', value: 9, common: false },
  { label: 'D.S.S. al Double Coda', value: 10, common: false },
  { label: 'D.S.S. al Fine', value: 11, common: false },
  { label: 'Da Coda', value: 12, common: false },
  { label: 'Da Double Coda', value: 13, common: false },
] as const;

export const ottavaOptions = [
  { label: '8va', value: 0, symbol: '\uE511', common: true },
  { label: '8vb', value: 1, symbol: '\uE51C', common: true },
  { label: '15ma', value: 2, symbol: '\uE515', common: true },
  { label: '15mb', value: 3, symbol: '\uE51D', common: true },
  { label: '22ma', value: 4, symbol: '\uE518', common: false },
  { label: '22mb', value: 5, symbol: '\uE51E', common: false },
] as const;

export const trillOptions = [
  { label: 'Trill line', value: 0 },
  { label: 'Up-prall line', value: 1 },
  { label: 'Down-prall line', value: 2 },
  { label: 'Prall-prall line', value: 3 },
] as const;

export const glissandoOptions = [
  { label: 'Straight glissando', value: 0, symbol: '\uE585' },
  { label: 'Wavy glissando', value: 1, symbol: '\uEAAF' },
] as const;

export const arpeggioOptions = [
  { label: 'Arpeggio', value: 0, symbol: '\uE63C' },
  { label: 'Arpeggio up', value: 1, symbol: '\uE634' },
  { label: 'Arpeggio down', value: 2, symbol: '\uE635' },
  { label: 'Arpeggio bracket', value: 3, symbol: '\uE002' },
] as const;

export const tremoloOptions = [
  { label: 'Eighth-note tremolo', value: 0, symbol: '\uE220', common: true },
  { label: '16th-note tremolo', value: 1, symbol: '\uE221', common: true },
  { label: '32nd-note tremolo', value: 2, symbol: '\uE222', common: true },
  { label: '64th-note tremolo', value: 3, symbol: '\uE223', common: false },
  { label: 'Buzz roll', value: 4, symbol: '\uE22A', common: false },
  { label: 'Two-note eighth tremolo', value: 5, symbol: '\uE220', common: false },
  { label: 'Two-note 16th tremolo', value: 6, symbol: '\uE221', common: false },
  { label: 'Two-note 32nd tremolo', value: 7, symbol: '\uE222', common: false },
  { label: 'Two-note 64th tremolo', value: 8, symbol: '\uE223', common: false },
] as const;

export const beamOptions = [
  { label: 'Auto beam', value: 0 },
  { label: 'Begin beam / break left', value: 2 },
  { label: 'Join beams', value: 6 },
  { label: 'No beam', value: 1 },
  { label: 'Break secondary beam at eighth', value: 3 },
  { label: 'Break secondary beam at 16th', value: 4 },
] as const;

export const fretDiagramOptions = [
  { label: 'Blank', pattern: '......' },
  { label: 'C', pattern: 'X32010' },
  { label: 'G', pattern: '320003' },
  { label: 'D', pattern: 'XX0232' },
  { label: 'A', pattern: 'X02220' },
  { label: 'E', pattern: '022100' },
  { label: 'Am', pattern: 'X02210' },
  { label: 'Em', pattern: '022000' },
  { label: 'Dm', pattern: 'XX0231' },
] as const;

export const fermataOptions = [
  { label: 'Fermata', value: 0, symbol: '\uE4C0', common: true },
  { label: 'Short fermata', value: 1, symbol: '\uE4C4', common: true },
  { label: 'Long fermata', value: 2, symbol: '\uE4C6', common: true },
  { label: 'Very short fermata', value: 3, symbol: '\uE4C2', common: false },
  { label: 'Very long fermata', value: 4, symbol: '\uE4C8', common: false },
] as const;

export const breathOptions = [
  { label: 'Breath mark', value: 0, symbol: '\uE4CE', common: true },
  { label: 'Caesura', value: 5, symbol: '\uE4D1', common: true },
  { label: 'Tick breath mark', value: 1, symbol: '\uE4CF', common: false },
  { label: 'Salzedo breath mark', value: 2, symbol: '\uE4D5', common: false },
  { label: 'Upbow breath mark', value: 3, symbol: '\uE4D0', common: false },
  { label: 'Curved caesura', value: 4, symbol: '\uE4D4', common: false },
  { label: 'Short caesura', value: 6, symbol: '\uE4D3', common: false },
  { label: 'Thick caesura', value: 7, symbol: '\uE4D2', common: false },
  { label: 'Chant caesura', value: 8, symbol: '\uE8F8', common: false },
] as const;

export const selectionFilterOptions = [
  { label: 'Voice 1', bit: 1, group: 'Voices' },
  { label: 'Voice 2', bit: 2, group: 'Voices' },
  { label: 'Voice 3', bit: 4, group: 'Voices' },
  { label: 'Voice 4', bit: 8, group: 'Voices' },
  { label: 'Notes and rests', bit: 1 << 23, group: 'Elements' },
  { label: 'Articulations', bit: 1 << 10, group: 'Elements' },
  { label: 'Dynamics', bit: 1 << 4, group: 'Elements' },
  { label: 'Text', bit: 1 << 9, group: 'Elements' },
  { label: 'Lyrics', bit: 1 << 7, group: 'Elements' },
  { label: 'Chord symbols', bit: 1 << 8, group: 'Elements' },
] as const;

/** Note input methods, keyed by the engine's NoteInputMethod value. */
export const noteInputMethodOptions = [
  { label: 'Step-time', value: 1 },
  { label: 'Repitch', value: 2 },
  { label: 'Rhythm', value: 3 },
  { label: 'Timewise (insert)', value: 6 },
] as const;

/** Palette categories the ribbon's "Open … Palette" links open, with their legacy test ids. */
export const paletteLinkOptions = [
  { category: 'Clefs', label: 'Clef Palette', testId: 'btn-open-clef-palette' },
  { category: 'Markers', label: 'Markers Palette', testId: 'btn-open-markers-palette' },
  { category: 'Jumps', label: 'Jumps Palette', testId: 'btn-open-jumps-palette' },
  { category: 'Dynamics', label: 'Dynamics Palette', testId: 'btn-open-dynamics-palette' },
  { category: 'Ottavas', label: 'Ottava Palette', testId: 'btn-open-ottava-palette' },
  { category: 'Tremolos', label: 'Tremolo Palette', testId: 'btn-open-tremolo-palette' },
  { category: 'Fermatas', label: 'Fermata Palette', testId: 'btn-open-fermata-palette' },
  { category: 'Breaths', label: 'Breath Palette', testId: 'btn-open-breath-palette' },
] as const;

/** Zoom levels offered as presets, as fractions of 100%. */
export const zoomPresets = [0.25, 0.5, 0.75, 1];

/**
 * Where the editor help page lives.
 *
 * The embed build is a static export (output: 'export', no trailingSlash) under basePath
 * /score-editor, so the page lands at /score-editor/help.html -- the host serves the .html
 * file directly and 404s the extensionless route. A raw <a href> is also not
 * basePath-prefixed by Next (only <Link>/router are). The normal server build serves the
 * App Router route at /help.
 */
export const getHelpHref = (): string =>
  process.env.NEXT_PUBLIC_BUILD_MODE === 'embed' ? '/score-editor/help.html' : '/help';
