/*
 * The annotation stamps (performer mode, Phase 4): engraved marks drawn with the score's own music font (Leland, SMuFL;
 * Bravura where Leland has no glyph), so a dynamic or a fingering looks like the printed one. A stamp is kept by its
 * SMuFL glyph name (`content`). Code points from SMuFL's glyphnames.json; boxes measured from Leland.otf (Bravura.otf
 * for the arrow), in staff spaces from the glyph's origin, y up: [south-west x, y, north-east x, y].
 */

export type StampGroup =
  'Dynamics' | 'Fingerings' | 'Strings' | 'Breath' | 'Accidentals' | 'Articulations' | 'Other';

export interface Stamp {
  readonly id: string;
  readonly label: string;
  readonly group: StampGroup;
  /** The character: a SMuFL code point (music font), or plain text for a mark SMuFL has no glyph for. */
  readonly char: string;
  readonly font: 'music' | 'text';
  /** The glyph's box in staff spaces, y up (music font only; text marks are centred by the browser). */
  readonly box: readonly [number, number, number, number];
  /** Size relative to engraved size (a SMuFL em is 4 staff spaces). */
  readonly scale: number;
}

const music = (
  id: string,
  label: string,
  group: StampGroup,
  codepoint: number,
  box: Stamp['box'],
  scale = 1,
): Stamp => ({
  id,
  label,
  group,
  char: String.fromCodePoint(codepoint),
  font: 'music',
  box,
  scale,
});

export const STAMPS: readonly Stamp[] = [
  music('dynamicPPP', 'ppp', 'Dynamics', 0xe52a, [-0.38, -0.65, 3.86, 1.05]),
  music('dynamicPP', 'pp', 'Dynamics', 0xe52b, [-0.38, -0.65, 2.56, 1.05]),
  music('dynamicPiano', 'p', 'Dynamics', 0xe520, [-0.38, -0.65, 1.27, 1.05]),
  music('dynamicMP', 'mp', 'Dynamics', 0xe52c, [-0.03, -0.65, 2.78, 1.05]),
  music('dynamicMF', 'mf', 'Dynamics', 0xe52d, [-0.03, -0.77, 2.83, 1.68]),
  music('dynamicForte', 'f', 'Dynamics', 0xe522, [-0.55, -0.77, 1.34, 1.68]),
  music('dynamicFF', 'ff', 'Dynamics', 0xe52f, [-0.55, -0.78, 2.35, 1.69]),
  music('dynamicFFF', 'fff', 'Dynamics', 0xe530, [-0.55, -0.78, 3.35, 1.69]),
  music('dynamicFortePiano', 'fp', 'Dynamics', 0xe534, [-0.54, -0.77, 2.32, 1.68]),
  music('dynamicSforzando1', 'sf', 'Dynamics', 0xe536, [0, -0.77, 2.27, 1.68]),
  music('dynamicSforzato', 'sfz', 'Dynamics', 0xe539, [0, -0.77, 2.79, 1.68]),
  music('fingering0', 'Fingering 0', 'Fingerings', 0xed10, [0, -0.02, 0.75, 1.02], 1.3),
  music('fingering1', 'Fingering 1', 'Fingerings', 0xed11, [0, 0, 0.59, 1.02], 1.3),
  music('fingering2', 'Fingering 2', 'Fingerings', 0xed12, [0, 0, 0.74, 1.02], 1.3),
  music('fingering3', 'Fingering 3', 'Fingerings', 0xed13, [0, -0.02, 0.73, 1.02], 1.3),
  music('fingering4', 'Fingering 4', 'Fingerings', 0xed14, [0, 0, 0.76, 1.02], 1.3),
  music('fingering5', 'Fingering 5', 'Fingerings', 0xed15, [0, -0.02, 0.72, 1.02], 1.3),
  music('stringsUpBow', 'Up bow', 'Strings', 0xe612, [0, 0, 1.05, 1.37]),
  music('stringsDownBow', 'Down bow', 'Strings', 0xe610, [0, 0, 1.26, 1.17]),
  music('breathMarkComma', 'Breath', 'Breath', 0xe4ce, [0, 0, 0.76, 1.28]),
  music('caesura', 'Caesura', 'Breath', 0xe4d1, [0, 0, 1.52, 1.96]),
  music('accidentalSharp', 'Sharp', 'Accidentals', 0xe262, [0, -1.33, 0.98, 1.34]),
  music('accidentalFlat', 'Flat', 'Accidentals', 0xe260, [0, -0.7, 0.81, 1.81]),
  music('accidentalNatural', 'Natural', 'Accidentals', 0xe261, [0, -1.29, 0.68, 1.3]),
  music('articAccentAbove', 'Accent', 'Articulations', 0xe4a0, [0, 0, 1.44, 0.94]),
  music('articTenutoAbove', 'Tenuto', 'Articulations', 0xe4a4, [0, 0, 1.26, 0.18]),
  music('articStaccatoAbove', 'Staccato', 'Articulations', 0xe4a2, [0, 0, 0.31, 0.31]),
  music('fermataAbove', 'Fermata', 'Articulations', 0xe4c0, [0, 0, 2.49, 1.47]),
  music('arrowBlackRight', 'Cue arrow', 'Other', 0xeb62, [0, 0.54, 2.11, 1.45]),
  {
    id: 'watch',
    label: 'Watch',
    group: 'Other',
    char: '👓',
    font: 'text',
    box: [0, 0, 0, 0],
    scale: 1,
  },
];

const BY_ID = new Map(STAMPS.map((stamp) => [stamp.id, stamp]));

/** The stamp kept as `content` (null for a mark saved before stamps were glyphs: drawn as its plain text). */
export const stampOf = (content: string | undefined): Stamp | null =>
  content ? (BY_ID.get(content) ?? null) : null;

/** The music font stack: the score's font, Bravura for glyphs it lacks (both loaded by the app's stylesheets). */
export const MUSIC_FONT = "'PerformMusic', 'BravuraFallback', serif";

/**
 * Where to draw a music stamp so its middle lands on `(x, y)` (page units, y down), with `space` page units to a staff
 * space: the text origin (baseline start) and the font size.
 */
export function stampOrigin(stamp: Stamp, x: number, y: number, space: number) {
  const size = 4 * space * stamp.scale;
  const unit = space * stamp.scale;
  const [swX, swY, neX, neY] = stamp.box;
  return { x: x - ((swX + neX) / 2) * unit, y: y + ((swY + neY) / 2) * unit, fontSize: size };
}
