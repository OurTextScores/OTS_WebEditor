import { describe, expect, it } from 'vitest';
import { showsAt, type Annotation } from '../../components/performer/annotations/annotationModel';
import { memoryAnnotationStore } from '../../components/performer/annotations/annotationStore';
import {
  anchorAt,
  fromSpaces,
  placeAnchor,
  toSpaces,
  type PageGeometry,
} from '../../components/performer/annotations/pageGeometry';

// One system on page 0: bars 0 and 1 side by side, two parts (staff bands 40 high: a staff space of 10)
const layout = (barWidth = 400, top = 100): PageGeometry => ({
  width: 1000,
  height: 1400,
  bars: [
    { index: 0, page: 0, x: 100, y: top, width: barWidth, height: 200 },
    { index: 1, page: 0, x: 100 + barWidth, y: top, width: barWidth, height: 200 },
  ],
  segments: [
    { tick: 0, page: 0, x: 130 },
    { tick: 480, page: 0, x: 250 },
    { tick: 1920, page: 0, x: 100 + barWidth + 30 },
  ],
  bands: [
    { page: 0, part: 0, y: top, height: 40 },
    { page: 0, part: 1, y: top + 120, height: 40 },
  ],
});

describe('anchoring annotations to the music', () => {
  it("takes a stamp's beat from its own bar, not a lower system's segment at the same x", () => {
    const base = layout();
    const geometry: PageGeometry = {
      ...base,
      bars: [
        { ...base.bars[0], tick: 0 },
        { ...base.bars[1], tick: 1920 },
        // Bar 2 on the next system down, its segments at the same x as bar 0's
        { index: 2, page: 0, x: 100, y: 500, width: 400, height: 200, tick: 3840 },
      ],
      segments: [
        { tick: 0, page: 0, x: 130 },
        { tick: 1920, page: 0, x: 430 },
        { tick: 3840 + 240, page: 0, x: 141 },
      ],
    };
    // Tapped above bar 0 at x 140: the nearest segment by x is bar 2's, but the beat is bar 0's
    expect(anchorAt(geometry, 0, 140, 90, true)?.anchor).toEqual({ bar: 0, part: 0, tick: 0 });
  });

  it("puts a mark at a system's first beat on the note, not on the clef sharing its tick", () => {
    const withHeader = layout();
    const geometry = {
      ...withHeader,
      segments: [{ tick: 0, page: 0, x: 105 }, ...withHeader.segments],
    };
    expect(placeAnchor(geometry, { bar: 0, part: 0, tick: 0 })?.x).toBe(130);
  });

  it('anchors a mark to the bar under it and the nearest staff, and a stamp to the nearest beat', () => {
    const ink = anchorAt(layout(), 0, 300, 110, false)!;
    expect(ink.anchor).toEqual({ bar: 0, part: 0 });
    expect(ink.placement).toEqual({ page: 0, x: 100, y: 100, space: 10 });
    const stamp = anchorAt(layout(), 0, 240, 235, true)!;
    expect(stamp.anchor).toEqual({ bar: 0, part: 1, tick: 480 });
    expect(stamp.placement.x).toBe(250);
    expect(anchorAt(layout(), 0, 20, 110, false)).toBeNull(); // left of the music
    // Above the system (where fingerings and text go): still its bar, up to 8 staff spaces away
    expect(anchorAt(layout(), 0, 300, 40, false)?.anchor).toEqual({ bar: 0, part: 0 });
    expect(anchorAt(layout(), 0, 300, 10, false)).toBeNull(); // 9 spaces above: too far
  });

  it('places an anchor again after a relayout: wider bars and a lower system move it with its bar and beat', () => {
    const before = layout();
    const { anchor, placement } = anchorAt(before, 0, 240, 115, true)!;
    const [dx, dy] = toSpaces(placement, 245, 112);
    const after: PageGeometry = {
      ...layout(600, 300),
      segments: [
        { tick: 0, page: 0, x: 140 },
        { tick: 480, page: 0, x: 380 },
      ],
    };
    const moved = placeAnchor(after, anchor)!;
    expect(moved).toEqual({ page: 0, x: 380, y: 300, space: 10 });
    // Still half a staff space left of its beat, and 1.2 below the staff's top line
    expect(fromSpaces(moved, dx, dy)).toEqual([375, 312]);
  });

  it('does not place an anchor whose bar or part is not laid out', () => {
    expect(placeAnchor(layout(), { bar: 7, part: 0 })).toBeNull();
    expect(placeAnchor(layout(), { bar: 0, part: 3 })).toBeNull();
    // Placed at another bar (a Play-through occurrence of the same written bar)
    expect(placeAnchor(layout(), { bar: 0, part: 0 }, 1)?.x).toBe(500);
  });
});

describe('annotations in the Play-through view', () => {
  const base: Annotation = {
    id: 'a1',
    scoreKey: 's',
    scorePart: -1,
    kind: 'stamp',
    anchor: { bar: 0, part: 0 },
    points: [[0, 0, 1]],
    style: { color: 'red', width: 0.2, opacity: 1 },
    createdAt: 0,
  };

  it('shows at every occurrence unless hidden there, or only at its own', () => {
    expect(showsAt(base, null)).toBe(true);
    expect(showsAt(base, 0)).toBe(true);
    expect(showsAt({ ...base, hiddenAt: [3] }, 3)).toBe(false);
    expect(showsAt({ ...base, hiddenAt: [3] }, 4)).toBe(true);
    expect(showsAt({ ...base, onlyAt: 3 }, 3)).toBe(true);
    expect(showsAt({ ...base, onlyAt: 3 }, 4)).toBe(false);
    expect(showsAt({ ...base, onlyAt: 3 }, null)).toBe(false); // a one-occurrence copy is not in the written view
  });

  it('keeps annotations per score in the store', async () => {
    const store = memoryAnnotationStore();
    await store.put(base);
    await store.put({ ...base, id: 'a2', scoreKey: 'other' });
    expect((await store.list('s')).map((a) => a.id)).toEqual(['a1']);
    await store.remove('a1');
    expect(await store.list('s')).toEqual([]);
    expect((await store.all()).map((a) => a.id)).toEqual(['a2']);
  });
});

describe('repeated marks in Play-through', () => {
  const mark = (extra: Partial<Annotation> = {}): Annotation => ({
    id: 'a',
    scoreKey: 's',
    scorePart: 0,
    kind: 'stamp',
    anchor: { bar: 1, part: 0 },
    points: [[0, 0, 1]],
    style: { color: 'black', width: 0, opacity: 1 },
    content: '4',
    createdAt: 0,
    ...extra,
  });
  // Bars played 0, 1, 0, 1, 2: written bar 1 is occurrences 1 and 3
  const played = [0, 1, 0, 1, 2];

  it('counts the occurrences a mark shows at, and hides it at one only', async () => {
    const { occurrencesShown, hiddenAtOccurrence } =
      await import('../../components/performer/annotations/annotationPlacement');
    expect(occurrencesShown(mark(), played)).toBe(2);
    const hidden = hiddenAtOccurrence(mark(), 3);
    expect(hidden.hiddenAt).toEqual([3]);
    expect(occurrencesShown(hidden, played)).toBe(1);
    expect(showsAt(hidden, 1)).toBe(true);
    expect(showsAt(hidden, 3)).toBe(false);
    expect(showsAt(hidden, null)).toBe(true); // the written view still has it
    expect(hiddenAtOccurrence(hidden, 3).hiddenAt).toEqual([3]);
  });

  it('lists marks whose bar is not in the layout as unplaced', async () => {
    const { unplacedOf } =
      await import('../../components/performer/annotations/annotationPlacement');
    const lost = mark({ id: 'lost', anchor: { bar: 99, part: 0 } });
    const here = mark({ id: 'here', anchor: { bar: 0, part: 0 } });
    expect(unplacedOf([lost, here], layout(), null).map((a) => a.id)).toEqual(['lost']);
  });
});

describe('stamp glyphs', () => {
  it('places a glyph so the middle of its box lands on the point', async () => {
    const { STAMPS, stampOf, stampOrigin } =
      await import('../../components/performer/annotations/stampGlyphs');
    const mf = stampOf('dynamicMF')!;
    expect(mf.char).toBe('');
    // Box [-0.03, -0.77, 2.83, 1.68] spaces; 10 page units a space: the middle is 1.4 right and 0.455 up of the origin
    const origin = stampOrigin(mf, 100, 200, 10);
    expect(origin.fontSize).toBe(40);
    expect(origin.x).toBeCloseTo(100 - 14);
    expect(origin.y).toBeCloseTo(200 + 4.55);
    expect(stampOf('4')).toBeNull(); // a mark saved as plain text before glyph stamps
    expect(new Set(STAMPS.map((stamp) => stamp.id)).size).toBe(STAMPS.length);
  });
});
