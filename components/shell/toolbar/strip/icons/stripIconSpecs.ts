import type { IconPart, IconSpec } from './StripIcon';

/**
 * The tool strip's icons, by control test id (SHELL_REDESIGN_DESIGN §24). Anything that is a notation symbol is the
 * symbol itself (SMuFL, as MuseScore and Viritura draw it); the rest are drawn parts on a 24 grid with a 1.6 stroke,
 * round ends. A control with no entry here (the file and view chrome) keeps its Lucide icon.
 */
const glyph = (
  code: string,
  at?: readonly [number, number],
  em?: number,
  box?: number,
  minSide?: number,
): IconPart => ({ glyph: code, at, em, box, minSide });
const line = (path: string, width?: number): IconPart => ({ path, width });
const solid = (path: string): IconPart => ({ path, fill: true });

const NOTE_UP = '\uE1D5'; // noteQuarterUp
const NOTE_DOWN = '\uE1D6'; // noteQuarterDown
const NOTEHEAD = '\uE0A4'; // noteheadBlack
const BARLINE = '\uE030'; // barlineSingle

/** A quarter note: the head at (x, y) with its stem (up from the right of the head, down from the left). */
const note = (x: number, y: number, up = true, em = 15): IconPart[] => {
  const half = em * 0.145;
  const length = em * 0.8;
  return [
    glyph(NOTEHEAD, [x, y], em),
    line(
      up
        ? `M${(x + half).toFixed(2)} ${y - 0.4}V${(y - length).toFixed(2)}`
        : `M${(x - half).toFixed(2)} ${y + 0.4}V${(y + length).toFixed(2)}`,
      1,
    ),
  ];
};

/** Thin staff lines across the grid, for the icons that need a staff (key signature, tie, slur). */
const staff = (top: number, gap: number, from = 2, to = 22): IconPart =>
  line(Array.from({ length: 5 }, (_, i) => `M${from} ${top + i * gap}H${to}`).join(''), 0.7);

/** Two barlines with a mark between them: a bar being added, removed, … */
const barWith = (...mark: IconPart[]): IconSpec => [
  glyph(BARLINE, [4.5, 12], 16, 16),
  glyph(BARLINE, [19.5, 12], 16, 16),
  ...mark,
];

export const STRIP_ICON_SPECS: Readonly<Record<string, IconSpec>> = {
  // File
  // A sound library: a chip with a waveform in it.
  'btn-load-soundfont': [
    line('M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'),
    line('M8 10.5v3M10.8 8v8M13.6 9.2v5.6M16.3 11v2'),
  ],

  // Notes: entry
  'dropdown-fretboards': [
    line('M6 4v16M10 4v16M14 4v16M18 4v16'),
    line('M6 4h12', 2.4),
    line('M6 10h12M6 15h12'),
    solid('M10 12.2a1.7 1.7 0 1 0 0.01 0zM18 17.2a1.7 1.7 0 1 0 0.01 0z'),
  ],
  'dropdown-grace-notes': [glyph('\uE560', [12, 12], 24, 20)],

  // Notes: connect
  'btn-flip-stem': [glyph(NOTE_UP, [7, 12], 17, 16), glyph(NOTE_DOWN, [17, 12], 17, 16)],
  'dropdown-lines': [glyph('\uE511', [12, 12], 20, 20)],
  'dropdown-chord': [
    glyph('\uE63C', [6.5, 12], 18, 17),
    glyph('\uE222', [16.5, 11], 24, 14),
    line('M16.5 4.5v13', 1.3),
  ],

  // Notes: rhythm and pitch
  'btn-duration-shorter': [
    glyph(NOTE_UP, [9, 12], 19, 17),
    line('M22 12h-6M18.5 9.5L16 12l2.5 2.5'),
  ],
  'btn-duration-longer': [
    glyph(NOTE_UP, [8.5, 12], 19, 17),
    line('M16 12h6M19.5 9.5L22 12l-2.5 2.5'),
  ],
  'btn-pitch-up': [...note(8, 16.5, true, 17), line('M17.5 19V6M14 9.5L17.5 6L21 9.5')],
  'btn-pitch-down': [...note(8, 7.5, false, 17), line('M17.5 5V18M14 14.5L17.5 18L21 14.5')],
  'btn-transpose-12': [
    glyph('\uE511', [8.5, 13], 14, 13),
    line('M19.5 19V6M16.5 9L19.5 6l3 3', 1.5),
  ],
  'btn-transpose--12': [
    glyph('\uE512', [8.5, 11], 14, 13),
    line('M19.5 5v13M16.5 15l3 3 3-3', 1.5),
  ],
  'btn-transpose-dialog': [
    ...note(8, 15, true, 17),
    line('M17.5 5v14M14.5 8l3-3 3 3M14.5 16l3 3 3-3', 1.5),
  ],
  'dropdown-markings': [glyph('\uE522', [12, 12], 22, 17)],
  'dropdown-hairpins': [glyph('\uE53E', [12, 12], 24, 20)],
  'dropdown-pedal': [glyph('\uE650', [12, 12], 22, 20)],
  'dropdown-articulations': [...note(11, 13, false, 18), glyph('\uE4A2', [12, 5], 24, 9, 4)],
  'btn-up-bow': [glyph('\uE612', [12, 12], 22, 15, 12)],
  'btn-down-bow': [glyph('\uE610', [12, 12], 22, 15, 12)],
  'dropdown-fermata': [glyph('\uE4C0', [12, 12], 24, 19)],
  'dropdown-breath': [glyph('\uE4CE', [12, 12], 48, 12, 10)],

  // Text and tempo
  'dropdown-text': [line('M5.5 6.5h13M12 6.5v12M9 18.5h6')],
  'btn-tempo-open': [glyph(NOTE_UP, [8, 12], 20, 17), line('M14.5 10h6M14.5 14h6')],

  // Layout
  'btn-new-line': [line('M4 8h10M4 12h6'), line('M20 6v8h-7M15.5 11.5L13 14l2.5 2.5')],
  'btn-new-page': [line('M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 15.5h5')],
  'btn-measures-open': barWith(line('M12 8v8M8.5 12h7')),
  'btn-pickup-open': [
    glyph(NOTE_UP, [8, 12.5], 17, 15),
    glyph(BARLINE, [17, 12], 16, 16),
    glyph(BARLINE, [21, 12], 16, 16),
  ],
  'btn-remove-containing-measures': barWith(line('M9 12h6')),
  'btn-remove-trailing-empty': barWith(line('M9.5 9.5l5 5M14.5 9.5l-5 5')),
  'dropdown-signature': [glyph('\uE08A', [12, 12], 20, 17)],
  // A major (three sharps) on a staff, as a key signature is drawn.
  'dropdown-key': [
    staff(7, 3.6, 2, 28),
    glyph('\uE262', [8, 7], 14),
    glyph('\uE262', [14, 12.4], 14),
    glyph('\uE262', [20, 5.2], 14),
  ],
  'btn-add-ambitus': [
    ...note(8, 18, true, 16),
    ...note(16, 6, false, 16),
    line('M10.4 14.5l3.2-7', 1.2),
  ],
  'dropdown-bulk-tools': [line('M3.5 12h6M9.5 12L15 6.5h5.5M9.5 12h11M9.5 12l5.5 5.5h5.5')],

  // Score
  'dropdown-clef': [glyph('\uE050', [12, 12], 18, 20)],
  'dropdown-instruments': [
    line('M4 6h16v12H4z'),
    line('M9.3 13v5M14.7 13v5'),
    solid('M7 6h3.3v7H7zM13.7 6H17v7h-3.3z'),
  ],
  'dropdown-repeats': [glyph('\uE040', [12, 12], 20, 18)],
  'dropdown-navigation': [glyph('\uE047', [12, 12], 24, 19)],
  'dropdown-jumps': [glyph('\uE048', [12, 12], 24, 19)],
};

/** The quick row's own icons (the Write toolbar is not strip data). */
export const QUICK_ROW_ICON_SPECS: Readonly<Record<string, IconSpec>> = {
  // A tie joins two notes of one pitch across a barline.
  'btn-tie': [
    staff(6, 3, 1, 33),
    line('M17 6v12', 1),
    ...note(9, 12, true, 12),
    ...note(25, 12, true, 12),
    line('M9.6 14.6Q17 21 24.4 14.6', 1.3),
  ],
  // A slur joins notes of different pitches: here from a ledger line to the top of the staff.
  'btn-slur': [
    staff(6, 3, 1, 33),
    line('M5 21H13', 0.9),
    ...note(9, 21, true, 12),
    ...note(25, 9, false, 12),
    line('M10.8 10Q17 0.5 25 5.2', 1.3),
  ],
  // More accidentals: the double sharp and an ellipsis (the quick buttons already show flat, natural and sharp).
  'dropdown-accidental': [
    glyph('\uE263', [8, 12], 22, 12, 7),
    solid(
      'M14.2 14.4a1.1 1.1 0 1 0 0.01 0zM18 14.4a1.1 1.1 0 1 0 0.01 0zM21.8 14.4a1.1 1.1 0 1 0 0.01 0z',
    ),
  ],
};

/** The augmentation dot, after Viritura's: a quarter note then its dots (metronome glyphs, a gap between). */
export const dotIconSpec = (dots: number): IconSpec => [
  glyph('\uECA5', [7.5, 12], 24, 17),
  ...Array.from({ length: dots }, (_, index) => glyph('\uECB7', [15 + index * 3.6, 16.2], 20, 4)),
];

/** Icons wider than the 24 grid: a staff needs room for its notes and sharps. */
export const ICON_VIEW_WIDTH: Readonly<Record<string, number>> = {
  'dropdown-key': 30,
  'dropdown-accidental': 26,
  'btn-tie': 34,
  'btn-slur': 34,
};
