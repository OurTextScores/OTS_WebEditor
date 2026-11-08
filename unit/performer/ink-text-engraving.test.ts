import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../components/performer/annotations/annotationModel';
import { recogniseInk } from '../../components/performer/engraving/inkShapes';
import { proposeEngraving } from '../../components/performer/engraving/stampEngraving';
import { readText } from '../../components/performer/engraving/textWords';
import { placeMark } from '../../components/score-editor/marks-review/engraveMarks';

type P = [number, number, number];
/** Points along straight segments through the given corners, `steps` per segment. */
const path = (corners: [number, number][], steps = 8): P[] => {
  const points: P[] = [[corners[0][0], corners[0][1], 0.5]];
  for (let c = 1; c < corners.length; c += 1) {
    const [x0, y0] = corners[c - 1];
    const [x1, y1] = corners[c];
    for (let s = 1; s <= steps; s += 1)
      points.push([x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, 0.5]);
  }
  return points;
};
const arc = (width: number, bow: number, n = 20): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [t * width, -Math.sin(Math.PI * t) * bow, 0.5] as P;
  });

describe('recognising ink shapes', () => {
  it('reads a one-stroke "<" as a crescendo hairpin and ">" as a diminuendo', () => {
    expect(
      recogniseInk(
        path([
          [6, 5],
          [0, 6],
          [6, 7],
        ]),
      ),
    ).toEqual({ kind: 'hairpin', subtype: 'cresc' });
    expect(
      recogniseInk(
        path([
          [0, 5],
          [6, 6],
          [0, 7],
        ]),
      ),
    ).toEqual({ kind: 'hairpin', subtype: 'dim' });
  });

  it('reads an arc as a slur, above or below by its bow', () => {
    expect(recogniseInk(arc(8, 1.5))).toEqual({ kind: 'slur', above: true });
    expect(recogniseInk(arc(8, -1.5))).toEqual({ kind: 'slur', above: false });
  });

  it('leaves anything else for the model', () => {
    expect(
      recogniseInk(
        path([
          [0, 6],
          [8, 6],
        ]),
      ),
    ).toBeNull(); // a straight line
    expect(
      recogniseInk(
        path([
          [0, 5],
          [2, 7],
          [4, 5],
          [6, 7],
          [8, 5],
        ]),
      ),
    ).toBeNull(); // a zigzag
    const circle = Array.from(
      { length: 30 },
      (_, i) => [Math.cos(i / 4.6) * 2, Math.sin(i / 4.6) * 2, 0.5] as P,
    );
    expect(recogniseInk(circle)).toBeNull();
    expect(
      recogniseInk(
        path([
          [0, 6],
          [0.5, 6.2],
        ]),
      ),
    ).toBeNull(); // too small
    expect(recogniseInk(arc(8, 7))).toBeNull(); // more a hump than a slur
  });
});

describe('reading text marks', () => {
  it('knows dynamics and the common words, ignoring case, spaces and full stops', () => {
    expect(readText('mf')).toEqual({ kind: 'dynamic', subtype: 'mf' });
    expect(readText(' Cresc. ')).toEqual({ kind: 'text', style: 'expression', text: 'cresc.' });
    expect(readText('pizz')).toEqual({ kind: 'text', style: 'technique', text: 'pizz.' });
    expect(readText('a tempo')).toEqual({ kind: 'text', style: 'tempo', text: 'a tempo' });
    expect(readText('watch the conductor')).toBeNull();
    expect(readText('')).toBeNull();
  });
});

const mark = (extra: Partial<Annotation>): Annotation => ({
  id: 'm',
  scoreKey: 's',
  scorePart: -1,
  kind: 'ink',
  anchor: { bar: 2, part: 0 },
  points: [[0, 0, 1]],
  style: { color: 'black', width: 0.2, opacity: 1 },
  createdAt: 0,
  ...extra,
});

describe('proposing ink and text engravings', () => {
  it('engraves a recognised hairpin between the notes its stroke spans', () => {
    const proposal = proposeEngraving(
      mark({
        points: path([
          [6, 5],
          [0, 6],
          [6, 7],
        ]),
        extent: { start: { bar: 2, tick: 0 }, end: { bar: 3, tick: 480 } },
      }),
    );
    expect(proposal.engrave).toMatchObject({
      kind: 'hairpin',
      subtype: 'cresc',
      bar: 2,
      tick: 0,
      endBar: 3,
      endTick: 480,
    });
  });

  it('needs reading for unrecognised ink, ink without an extent, and unknown words', () => {
    expect(
      proposeEngraving(
        mark({
          points: path([
            [0, 6],
            [8, 6],
          ]),
        }),
      ).engrave,
    ).toBeNull();
    expect(
      proposeEngraving(
        mark({
          points: path([
            [6, 5],
            [0, 6],
            [6, 7],
          ]),
        }),
      ),
    ).toMatchObject({
      engrave: null,
      reason: 'needs-interpretation',
    });
    expect(
      proposeEngraving(
        mark({ kind: 'text', content: 'breathe here', anchor: { bar: 1, part: 0, tick: 0 } }),
      ).engrave,
    ).toBeNull();
  });

  it('engraves known words as text of their kind', () => {
    expect(
      proposeEngraving(
        mark({ kind: 'text', content: 'rit.', anchor: { bar: 1, part: 0, tick: 240 } }),
      ).engrave,
    ).toMatchObject({ kind: 'text', style: 'tempo', subtype: 'rit.', bar: 1, tick: 240 });
  });

  it('turns the end bar into an absolute tick in the editor', () => {
    const annotation = mark({
      points: path([
        [6, 5],
        [0, 6],
        [6, 7],
      ]),
      extent: { start: { bar: 2, tick: 0 }, end: { bar: 3, tick: 480 } },
    });
    const placed = placeMark(proposeEngraving(annotation).engrave!, annotation, {
      signatures: [],
      ticks: [0, 1920, 3840, 5760],
    });
    expect(placed.engine).toMatchObject({ kind: 'hairpin', tick: 3840, endTick: 5760 + 480 });
  });
});
