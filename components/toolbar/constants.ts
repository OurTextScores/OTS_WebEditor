export const toolbarInputBaseClass =
    'rounded border-0 bg-white px-2 py-0.5 text-xs font-medium leading-4 text-slate-800 shadow-sm ring-1 ring-slate-200 transition focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-500';

export const dropdownTextClass = 'px-2 py-1 text-xs font-medium leading-4 text-slate-800';

export const toolbarSectionLabelClass = 'text-[10px] font-bold uppercase tracking-wider text-slate-800 mr-2 flex items-center cursor-grab active:cursor-grabbing';

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
    { label: 'Treble', value: 0 },          // ClefType::G
    { label: 'Bass', value: 20 },           // ClefType::F
    { label: 'French Violin', value: 7 },   // ClefType::G_1
    { label: 'Treble 15mb', value: 1 },     // ClefType::G15_MB
    { label: 'Treble 8vb', value: 2 },      // ClefType::G8_VB
    { label: 'Treble 8va', value: 3 },      // ClefType::G8_VA
    { label: 'Treble 15ma', value: 4 },     // ClefType::G15_MA
    { label: 'Treble 8vb (O)', value: 5 },  // ClefType::G8_VB_O
    { label: 'Treble 8vb (P)', value: 6 },  // ClefType::G8_VB_P
    { label: 'Soprano', value: 8 },         // ClefType::C1
    { label: 'Mezzo', value: 9 },           // ClefType::C2
    { label: 'Alto', value: 10 },           // ClefType::C3
    { label: 'Tenor', value: 11 },          // ClefType::C4
    { label: 'Baritone', value: 12 },       // ClefType::C5
    { label: 'C (19c)', value: 13 },        // ClefType::C_19C
    { label: 'C1 (F18c)', value: 14 },      // ClefType::C1_F18C
    { label: 'C3 (F18c)', value: 15 },      // ClefType::C3_F18C
    { label: 'C4 (F18c)', value: 16 },      // ClefType::C4_F18C
    { label: 'C1 (F20c)', value: 17 },      // ClefType::C1_F20C
    { label: 'C3 (F20c)', value: 18 },      // ClefType::C3_F20C
    { label: 'C4 (F20c)', value: 19 },      // ClefType::C4_F20C
    { label: 'Bass 15mb', value: 21 },      // ClefType::F15_MB
    { label: 'Bass 8vb', value: 22 },       // ClefType::F8_VB
    { label: 'Bass 8va', value: 23 },       // ClefType::F_8VA
    { label: 'Bass 15ma', value: 24 },      // ClefType::F_15MA
    { label: 'F (B)', value: 25 },          // ClefType::F_B
    { label: 'F (C)', value: 26 },          // ClefType::F_C
    { label: 'F (F18c)', value: 27 },       // ClefType::F_F18C
    { label: 'F (19c)', value: 28 },        // ClefType::F_19C
    { label: 'Perc', value: 29 },           // ClefType::PERC
    { label: 'Perc 2', value: 30 },         // ClefType::PERC2
    { label: 'TAB', value: 31 },            // ClefType::TAB
    { label: 'TAB4', value: 32 },           // ClefType::TAB4
    { label: 'TAB Serif', value: 33 },      // ClefType::TAB_SERIF
    { label: 'TAB4 Serif', value: 34 },     // ClefType::TAB4_SERIF
];

export const graceNoteOptions = [
    { label: 'Acciaccatura', value: 1, testId: 'btn-grace-acciaccatura' },    // NoteType::ACCIACCATURA
    { label: 'Appoggiatura', value: 2, testId: 'btn-grace-appoggiatura' },    // NoteType::APPOGGIATURA
    { label: 'Grace 16th', value: 8, testId: 'btn-grace-16' },                // NoteType::GRACE16
    { label: 'Grace 32nd', value: 16, testId: 'btn-grace-32' },               // NoteType::GRACE32
    { label: 'Grace 8th After', value: 32, testId: 'btn-grace-8-after' },     // NoteType::GRACE8_AFTER
    { label: 'Grace 16th After', value: 64, testId: 'btn-grace-16-after' },   // NoteType::GRACE16_AFTER
    { label: 'Grace 32nd After', value: 128, testId: 'btn-grace-32-after' },  // NoteType::GRACE32_AFTER
];

export const durationOptions = [
    { label: '32nd', value: 7, shortcut: '2', testId: 'btn-duration-32' },   // DurationType::V_32ND
    { label: '16th', value: 6, shortcut: '3', testId: 'btn-duration-16' },   // DurationType::V_16TH
    { label: '8th', value: 5, shortcut: '4', testId: 'btn-duration-8' },     // DurationType::V_EIGHTH
    { label: 'Quarter', value: 4, shortcut: '5', testId: 'btn-duration-4' }, // DurationType::V_QUARTER
    { label: 'Half', value: 3, shortcut: '6', testId: 'btn-duration-2' },    // DurationType::V_HALF
    { label: 'Whole', value: 2, shortcut: '7', testId: 'btn-duration-1' },   // DurationType::V_WHOLE
];

export const dynamicOptions = [
    { label: 'p', value: 6 },      // DynamicType::P
    { label: 'mp', value: 7 },     // DynamicType::MP
    { label: 'mf', value: 8 },     // DynamicType::MF
    { label: 'f', value: 9 },      // DynamicType::F
    { label: 'pp', value: 5 },     // DynamicType::PP
    { label: 'ff', value: 10 },    // DynamicType::FF
    { label: 'ppp', value: 4 },    // DynamicType::PPP
    { label: 'fff', value: 11 },   // DynamicType::FFF
    { label: 'pppp', value: 3 },   // DynamicType::PPPP
    { label: 'ffff', value: 12 },  // DynamicType::FFFF
    { label: 'ppppp', value: 2 },  // DynamicType::PPPPP
    { label: 'fffff', value: 13 }, // DynamicType::FFFFF
    { label: 'pppppp', value: 1 }, // DynamicType::PPPPPP
    { label: 'ffffff', value: 14 }, // DynamicType::FFFFFF
    { label: 'fp', value: 15 },    // DynamicType::FP
    { label: 'pf', value: 16 },    // DynamicType::PF
    { label: 'sf', value: 17 },    // DynamicType::SF
    { label: 'sfz', value: 18 },   // DynamicType::SFZ
    { label: 'sff', value: 19 },   // DynamicType::SFF
    { label: 'sffz', value: 20 },  // DynamicType::SFFZ
    { label: 'sfp', value: 21 },   // DynamicType::SFP
    { label: 'sfpp', value: 22 },  // DynamicType::SFPP
    { label: 'rfz', value: 23 },   // DynamicType::RFZ
    { label: 'rf', value: 24 },    // DynamicType::RF
    { label: 'fz', value: 25 },    // DynamicType::FZ
    { label: 'm', value: 26 },     // DynamicType::M
    { label: 'r', value: 27 },     // DynamicType::R
    { label: 's', value: 28 },     // DynamicType::S
    { label: 'z', value: 29 },     // DynamicType::Z
    { label: 'n', value: 30 },     // DynamicType::N
];

export const hairpinOptions = [
    { label: 'Crescendo', value: 0, testId: 'btn-hairpin-cresc' },   // HairpinType::CRESC_HAIRPIN
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
    { label: 'Normal', value: 1 },         // BarLineType::NORMAL
    { label: 'Double', value: 2 },         // BarLineType::DOUBLE
    { label: 'Final', value: 32 },         // BarLineType::END
    { label: 'Heavy', value: 512 },        // BarLineType::HEAVY
    { label: 'Heavy-Heavy', value: 1024 }, // BarLineType::DOUBLE_HEAVY
    { label: 'Dashed', value: 16 },        // BarLineType::BROKEN
    { label: 'Dotted', value: 128 },       // BarLineType::DOTTED
    { label: 'Reverse Final', value: 256 }, // BarLineType::REVERSE_END
];

export const voltaOptions = [
    { label: '1st Ending', ending: 1 },
    { label: '2nd Ending', ending: 2 },
];

export const accidentalOptions = [
    { label: '♯', value: 3 },  // AccidentalType::SHARP
    { label: '♭', value: 1 },  // AccidentalType::FLAT
    { label: '♮', value: 2 },  // AccidentalType::NATURAL
    { label: 'x', value: 4 },  // AccidentalType::SHARP2
    { label: '♭♭', value: 5 }, // AccidentalType::FLAT2
    { label: 'Clear', value: 0 }, // AccidentalType::NONE
];

export const shortcutEntries = [
    { label: 'Delete: Delete / Backspace', title: 'Shortcut: Delete / Backspace' },
    { label: 'Undo: Ctrl/Cmd + Z', title: 'Shortcut: Ctrl/Cmd + Z' },
    { label: 'Redo: Ctrl + Y, Cmd + Shift + Z', title: 'Shortcut: Ctrl + Y, Cmd + Shift + Z' },
    { label: 'Pitch: Arrow Up/Down', title: 'Shortcut: Arrow Up/Down' },
    { label: 'Octave: Ctrl/Cmd + Arrow Up/Down', title: 'Shortcut: Ctrl/Cmd + Arrow Up/Down' },
    {
        label: 'Duration numbers: 1=64th, 2=32nd, 3=16th, 4=8th, 5=Quarter, 6=Half, 7=Whole, 8=Breve',
        title: "Shortcut: Press 1-8 to respell the selected note's duration",
    },
    {
        label: 'Pitch letters: A-G (Shift to add to chord)',
        title: 'Shortcut: Press A-G to respell pitch, hold Shift to add another pitch to the chord',
    },
    { label: 'Rest: 0 (insert rest)', title: 'Shortcut: Press 0 to insert a rest instead of a note' },
    { label: 'Select All: Ctrl/Cmd + A', title: 'Shortcut: Ctrl/Cmd + A' },
    { label: 'Copy: Ctrl/Cmd + C', title: 'Shortcut: Ctrl/Cmd + C' },
    { label: 'Paste: Ctrl/Cmd + V', title: 'Shortcut: Ctrl/Cmd + V' },
];
