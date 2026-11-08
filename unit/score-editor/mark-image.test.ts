import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../components/performer/annotations/annotationModel';
import type { PageGeometry } from '../../components/performer/annotations/pageGeometry';
import {
  composeMarkPicture,
  INK_OVER_MUSIC,
  staffInView,
} from '../../components/score-editor/marks-review/markImage';

// One system: bars 0 and 1 side by side, a staff at y 100 with 10-unit staff spaces (40 high)
const geometry: PageGeometry = {
  width: 1000,
  height: 1400,
  bars: [
    { index: 0, page: 0, x: 100, y: 100, width: 200, height: 40, tick: 0 },
    { index: 1, page: 0, x: 300, y: 100, width: 200, height: 40, tick: 1920 },
  ],
  segments: [
    { tick: 0, page: 0, x: 120 },
    { tick: 1920, page: 0, x: 320 },
    { tick: 2400, page: 0, x: 380 },
  ],
  bands: [{ page: 0, part: 0, y: 100, height: 40 }],
};
const PAGE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000px" height="1400px" viewBox="0 0 1000 1400"><g id="music"/></svg>';
const ink = (extra: Partial<Annotation> = {}): Annotation => ({
  id: 'i',
  scoreKey: 's',
  scorePart: -1,
  kind: 'ink',
  anchor: { bar: 1, part: 0, tick: 480 },
  points: [
    [0, -2, 1],
    [2, -2.5, 1],
  ],
  style: { color: 'black', width: 0.2, opacity: 1 },
  createdAt: 0,
  ...extra,
});

describe('the music picture of an ink mark', () => {
  it('places the ink at its beat in this layout and crops to its bar and staff', () => {
    const picture = composeMarkPicture(PAGE, geometry, ink(), 0)!;
    // Beat 480 of bar 1 is the segment at x 380; y is staff spaces from the top line (100)
    expect(picture.svg).toContain('points="380.0,80.0 400.0,75.0"');
    expect(picture.svg).toContain(`stroke="${INK_OVER_MUSIC}"`);
    expect(picture.svg).toContain('<g id="music"/>');
    // Bar 1 (300..500) with 3 spaces either side; the staff (100..140) with 6 spaces above and below
    expect(picture.svg).toContain('viewBox="270.0 40.0 260.0 160.0"');
    expect(picture).toMatchObject({ width: 624, height: 384 }); // 24 px per staff space
  });

  it('widens to the bar where a stroke ends', () => {
    const picture = composeMarkPicture(
      PAGE,
      geometry,
      ink({
        anchor: { bar: 0, part: 0, tick: 0 },
        extent: { start: { bar: 0, tick: 0 }, end: { bar: 1, tick: 480 } },
      }),
      0,
    )!;
    expect(picture.svg).toContain('viewBox="70.0 40.0 460.0 160.0"');
  });

  it('is null when the mark cannot be placed here, or is not ink', () => {
    expect(composeMarkPicture(PAGE, geometry, ink({ anchor: { bar: 9, part: 0 } }), 0)).toBeNull();
    expect(composeMarkPicture(PAGE, geometry, ink(), 3)).toBeNull();
    expect(composeMarkPicture(PAGE, geometry, ink({ kind: 'text' }), 0)).toBeNull();
    expect(composeMarkPicture('not svg', geometry, ink(), 0)).toBeNull();
  });
});

describe('which staff a mark is on in the view open here', () => {
  it('is its own staff in its own view, and its part’s staff in the full score', () => {
    expect(staffInView(ink({ scorePart: 2, anchor: { bar: 0, part: 0 } }), 2)).toBe(0);
    expect(staffInView(ink({ scorePart: 2, anchor: { bar: 0, part: 0 } }), -1)).toBe(2);
    expect(staffInView(ink({ scorePart: -1, anchor: { bar: 0, part: 1 } }), -1)).toBe(1);
    expect(staffInView(ink({ scorePart: -1 }), 1)).toBeNull();
  });
});
