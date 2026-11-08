import type { Annotation } from '../annotations/annotationModel';
import { stampOf } from '../annotations/stampGlyphs';
import { recogniseInk } from './inkShapes';
import { readText } from './textWords';

/** What the engine engraves for one mark (addElementsAt's input). */
export interface EngravingMark {
  readonly kind:
    | 'dynamic'
    | 'fingering'
    | 'articulation'
    | 'fermata'
    | 'breath'
    | 'accidental'
    | 'hairpin'
    | 'slur'
    | 'text';
  readonly subtype: string;
  readonly staff: number;
  /** The written bar, and the beat in ticks from its start (the editor makes it absolute, in the score it has open). */
  readonly bar: number;
  readonly tick: number;
  /** Staff spaces below the top staff line where the stamp was put (negative: above the staff). */
  readonly y: number;
  /** Hairpins and slurs: where they end (a written bar, and ticks from its start). */
  readonly endBar?: number;
  readonly endTick?: number;
  /** Text: expression, technique or tempo. */
  readonly style?: 'expression' | 'technique' | 'tempo';
}

/** A mark's proposed engraving (Phase 7a: stamps, by rule), or why it stays a mark. */
export type EngravingProposal =
  | { readonly engrave: EngravingMark; readonly label: string }
  | {
      readonly engrave: null;
      readonly label: string;
      readonly reason: 'reminder' | 'needs-interpretation' | 'unplaced';
    };

const DYNAMICS: Record<string, string> = {
  dynamicPPP: 'ppp',
  dynamicPP: 'pp',
  dynamicPiano: 'p',
  dynamicMP: 'mp',
  dynamicMF: 'mf',
  dynamicForte: 'f',
  dynamicFF: 'ff',
  dynamicFFF: 'fff',
  dynamicFortePiano: 'fp',
  dynamicSforzando1: 'sf',
  dynamicSforzato: 'sfz',
};
const ARTICULATIONS = new Set([
  'stringsUpBow',
  'stringsDownBow',
  'articAccentAbove',
  'articTenutoAbove',
  'articStaccatoAbove',
]);
const BREATHS = new Set(['breathMarkComma', 'caesura']);
const ACCIDENTALS = new Set(['accidentalSharp', 'accidentalFlat', 'accidentalNatural']);

/**
 * The rule for a stamp (plan Phase 7, §7.2): dynamics, fingerings, bowings and articulations, fermatas and breath marks
 * engrave as themselves; sharp, flat and natural as a courtesy accidental (the engine declines when the note is not
 * spelled that way); the cue arrow and glasses stay marks. Ink and text need interpreting (Phase 7c).
 */
export function proposeEngraving(annotation: Annotation): EngravingProposal {
  if (annotation.kind === 'ink') return proposeInk(annotation);
  if (annotation.kind === 'text') return proposeText(annotation);
  const stamp = stampOf(annotation.content);
  const { anchor } = annotation;
  if (!stamp || stamp.font === 'text' || stamp.id === 'arrowBlackRight') {
    return {
      engrave: null,
      label: `Stays a mark (${stamp?.label ?? 'a reminder'})`,
      reason: 'reminder',
    };
  }
  if (anchor.tick === undefined)
    return { engrave: null, label: 'Not at a beat', reason: 'unplaced' };
  const base = {
    staff: anchor.part,
    bar: anchor.bar,
    tick: anchor.tick,
    y: annotation.points[0]?.[1] ?? 0,
  };
  const id = stamp.id;
  if (DYNAMICS[id])
    return {
      engrave: { ...base, kind: 'dynamic', subtype: DYNAMICS[id] },
      label: `Dynamic ${stamp.label}`,
    };
  if (id.startsWith('fingering')) {
    const digit = id.slice('fingering'.length);
    return {
      engrave: { ...base, kind: 'fingering', subtype: digit },
      label: `Fingering ${digit} on the nearest note`,
    };
  }
  if (ARTICULATIONS.has(id))
    return { engrave: { ...base, kind: 'articulation', subtype: id }, label: stamp.label };
  if (id === 'fermataAbove')
    return { engrave: { ...base, kind: 'fermata', subtype: id }, label: 'Fermata' };
  if (BREATHS.has(id))
    return { engrave: { ...base, kind: 'breath', subtype: id }, label: stamp.label };
  if (ACCIDENTALS.has(id)) {
    return {
      engrave: { ...base, kind: 'accidental', subtype: id },
      label: `Courtesy ${stamp.label.toLowerCase()} (only if the note is spelled so)`,
    };
  }
  return { engrave: null, label: `Stays a mark (${stamp.label})`, reason: 'reminder' };
}

const NEEDS_READING = 'Needs reading (handwriting: Interpret with AI)';

/** Ink: a clear hairpin or slur between the notes the stroke spans; anything else needs reading. */
function proposeInk(annotation: Annotation): EngravingProposal {
  const shape = recogniseInk(annotation.points);
  const extent = annotation.extent;
  if (!shape || !extent)
    return { engrave: null, label: NEEDS_READING, reason: 'needs-interpretation' };
  const ys = annotation.points.map((point) => point[1]);
  const y = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const base = {
    staff: annotation.anchor.part,
    bar: extent.start.bar,
    tick: extent.start.tick,
    endBar: extent.end.bar,
    endTick: extent.end.tick,
    y,
  };
  if (shape.kind === 'hairpin') {
    return {
      engrave: { ...base, kind: 'hairpin', subtype: shape.subtype },
      label: shape.subtype === 'cresc' ? 'Crescendo hairpin' : 'Diminuendo hairpin',
    };
  }
  return { engrave: { ...base, kind: 'slur', subtype: '' }, label: 'Slur' };
}

/** Text: a dynamic, or a well-known expression, technique or tempo word; anything else needs reading. */
function proposeText(annotation: Annotation): EngravingProposal {
  const meaning = readText(annotation.content);
  const { anchor } = annotation;
  if (!meaning || anchor.tick === undefined) {
    return { engrave: null, label: NEEDS_READING, reason: 'needs-interpretation' };
  }
  const base = {
    staff: anchor.part,
    bar: anchor.bar,
    tick: anchor.tick,
    y: annotation.points[0]?.[1] ?? 0,
  };
  if (meaning.kind === 'dynamic') {
    return {
      engrave: { ...base, kind: 'dynamic', subtype: meaning.subtype },
      label: `Dynamic ${meaning.subtype}`,
    };
  }
  const kindLabel = {
    expression: 'Expression text',
    technique: 'Technique text',
    tempo: 'Tempo text',
  }[meaning.style];
  return {
    engrave: { ...base, kind: 'text', subtype: meaning.text, style: meaning.style },
    label: `${kindLabel} “${meaning.text}”`,
  };
}
