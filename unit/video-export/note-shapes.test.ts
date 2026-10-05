import { describe, expect, it } from 'vitest';
import { parseNoteShapes, shapesInBox } from '../../lib/video-export/noteShapes';

const HEAD =
  'M0,4.20313 C0,8.5 3.09375,13.2969 11.2031,13.2969 C21.5938,13.2969 32.5,4.79688 32.5,-4 C32.5,-9.90625 27.5,-13.2031 21.2969,-13.2031 C11.5938,-13.2031 0,-5 0,4.20313';
const svg = `<svg>
<path class="Note" transform="matrix(0.992,0,0,0.992,519.413,758.198)" d="${HEAD}"/>
<path class="Note" transform="matrix(0.992,0,0,0.992,519.413,733.398)" d="${HEAD}"/>
<path class="Note" transform="matrix(0.992,0,0,0.992,594.793,745.798)" d="${HEAD}"/>
<path class="Rest" transform="matrix(1,0,0,1,686,677)" d="M0,0 L10,20 Z"/>
<path class="Stem" d="M1,2 L3,4"/>
<path class="Note" transform="matrix(1,0,0,1,5,5)" d="m0,0 l5,5"/>
</svg>`;

describe('parseNoteShapes', () => {
  const shapes = parseNoteShapes(svg);

  it('reads notes and rests, not stems or other classes', () => {
    expect(shapes).toHaveLength(5);
  });

  it('puts a notehead centre where the browser measured it (535.53, 758.24)', () => {
    expect(shapes[0].cx).toBeCloseTo(535.53, 1);
    expect(shapes[0].cy).toBeCloseTo(758.2, 1);
    expect(shapes[0].matrix).toEqual([0.992, 0, 0, 0.992, 519.413, 758.198]);
    expect(shapes[0].d).toBe(HEAD);
  });

  it('falls back to the origin for path commands it does not read', () => {
    expect(shapes[4].cx).toBe(5);
    expect(shapes[4].cy).toBe(5);
  });

  it('ignores a malformed matrix', () => {
    expect(parseNoteShapes('<path class="Note" transform="matrix(1,2,3)" d="M0,0"/>')).toEqual([]);
  });
});

describe('shapesInBox', () => {
  const shapes = parseNoteShapes(svg);
  const box = { id: 0, page: 0, x: 519, y: 634, sx: 75.4, sy: 99.2, width: 75.4, height: 99.2 };

  it('picks the chord at the box (both heads), not the next chord', () => {
    const lit = shapesInBox(shapes, box);
    expect(lit.map((s) => Math.round(s.cx))).toEqual([536, 536]);
  });

  it('excludes notes outside its x extent', () => {
    expect(shapesInBox(shapes, { ...box, x: 100 })).toHaveLength(0);
  });
});
