import { describe, expect, it } from 'vitest';
import { rgbaToI420 } from '../../lib/video-export/i420';

const solid = (r: number, g: number, b: number, width = 4, height = 4) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([r, g, b, 255], i * 4);
  return data;
};
const planes = (out: Uint8Array, width: number, height: number) => ({
  y: out.slice(0, width * height),
  u: out.slice(width * height, width * height + (width * height) / 4),
  v: out.slice(width * height + (width * height) / 4),
});

describe('rgbaToI420', () => {
  it('lays out Y, then U, then V, at 1.5 bytes per pixel', () => {
    expect(rgbaToI420(solid(0, 0, 0, 8, 6), 8, 6)).toHaveLength(8 * 6 * 1.5);
  });

  it('maps white and black to the limited-range extremes with neutral chroma', () => {
    const white = planes(rgbaToI420(solid(255, 255, 255), 4, 4), 4, 4);
    expect([...new Set(white.y)]).toEqual([235]);
    expect([...new Set(white.u)]).toEqual([128]);
    expect([...new Set(white.v)]).toEqual([128]);
    const black = planes(rgbaToI420(solid(0, 0, 0), 4, 4), 4, 4);
    expect([...new Set(black.y)]).toEqual([16]);
    expect([...new Set(black.u)]).toEqual([128]);
  });

  it('puts red, green and blue where BT.709 says (within rounding)', () => {
    const near = (a: number, b: number) => Math.abs(a - b) <= 1;
    const red = planes(rgbaToI420(solid(255, 0, 0), 4, 4), 4, 4);
    expect(near(red.y[0], 63)).toBe(true);
    expect(near(red.u[0], 102)).toBe(true);
    expect(near(red.v[0], 240)).toBe(true);
    const green = planes(rgbaToI420(solid(0, 255, 0), 4, 4), 4, 4);
    expect(near(green.y[0], 173)).toBe(true);
    expect(near(green.u[0], 42)).toBe(true);
    expect(near(green.v[0], 26)).toBe(true);
    const blue = planes(rgbaToI420(solid(0, 0, 255), 4, 4), 4, 4);
    expect(near(blue.y[0], 32)).toBe(true);
    expect(near(blue.u[0], 240)).toBe(true);
    expect(near(blue.v[0], 118)).toBe(true);
  });

  it('keeps luma per pixel and averages chroma over each 2x2 block', () => {
    // Left 2x2 block white, right 2x2 block black, on a 4x2 image.
    const data = new Uint8ClampedArray(4 * 2 * 4);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 4; x += 1)
        data.set(x < 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * 4 + x) * 4);
    }
    const { y, u, v } = planes(rgbaToI420(data, 4, 2), 4, 2);
    expect([...y]).toEqual([235, 235, 16, 16, 235, 235, 16, 16]);
    expect([...u]).toEqual([128, 128]);
    expect([...v]).toEqual([128, 128]);
    // A mixed block averages: one white and three black pixels.
    const mixed = solid(0, 0, 0, 2, 2);
    mixed.set([255, 255, 255, 255], 0);
    const m = planes(rgbaToI420(mixed, 2, 2), 2, 2);
    expect(m.y[0]).toBe(235);
    expect(m.y[1]).toBe(16);
  });

  it('rejects odd dimensions', () => {
    expect(() => rgbaToI420(solid(0, 0, 0, 3, 2), 3, 2)).toThrow(/even/);
  });
});
