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
  it('anchors a mark to the bar under it and the nearest staff, and a stamp to the nearest beat', () => {
    const ink = anchorAt(layout(), 0, 300, 110, false)!;
    expect(ink.anchor).toEqual({ bar: 0, part: 0 });
    expect(ink.placement).toEqual({ page: 0, x: 100, y: 100, space: 10 });
    const stamp = anchorAt(layout(), 0, 240, 235, true)!;
    expect(stamp.anchor).toEqual({ bar: 0, part: 1, tick: 480 });
    expect(stamp.placement.x).toBe(250);
    expect(anchorAt(layout(), 0, 20, 110, false)).toBeNull(); // left of the music
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
