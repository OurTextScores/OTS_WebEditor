import { describe, expect, it } from 'vitest';
import { svgScreenMapping } from '../lib/svg-screen-matrix';

const svgWith = (
  view: { x: number; y: number; width: number; height: number } | null,
  rect: { left: number; top: number; width: number; height: number },
  aspect?: { align: number; meetOrSlice: number },
) =>
  ({
    viewBox: view ? { baseVal: view } : undefined,
    preserveAspectRatio: aspect ? { baseVal: aspect } : undefined,
    getBoundingClientRect: () => rect,
    getScreenCTM: () => null,
  }) as unknown as SVGSVGElement;

const round = ({ x, y }: { x: number; y: number }) => [
  Math.round(x * 1000) / 1000,
  Math.round(y * 1000) / 1000,
];

describe('svgScreenMapping', () => {
  it('maps through the client rect, which includes CSS transforms of ancestors', () => {
    // The editor at 29% zoom: a 2977.2-unit page drawn 864 px wide at (384, 201). WebKit's getScreenCTM() reports
    // scale 1 here; the rect-based mapping must not.
    const mapping = svgScreenMapping(
      svgWith(
        { x: 0, y: 0, width: 2977.2, height: 4208.4 },
        { left: 384, top: 201, width: 864, height: 1221.27 },
      ),
    )!;
    expect(round(mapping.toClient(1140.44, 696.12))).toEqual([714.965, 403.013]);
    const back = mapping.toEngraving(714.965, 403.013);
    expect(back.x).toBeCloseTo(1140.44, 1);
    expect(back.y).toBeCloseTo(696.12, 1);
  });

  it('honours the viewBox origin, letterboxing (meet), slice and none', () => {
    const view = { x: 10, y: 20, width: 100, height: 50 };
    const rect = { left: 0, top: 0, width: 200, height: 200 };
    expect(round(svgScreenMapping(svgWith(view, rect))!.toClient(10, 20))).toEqual([0, 50]);
    expect(
      round(svgScreenMapping(svgWith(view, rect, { align: 6, meetOrSlice: 2 }))!.toClient(10, 20)),
    ).toEqual([-100, 0]);
    expect(
      round(svgScreenMapping(svgWith(view, rect, { align: 1, meetOrSlice: 1 }))!.toClient(110, 70)),
    ).toEqual([200, 200]);
  });

  it('is null without a viewBox or a screen matrix', () => {
    expect(svgScreenMapping(svgWith(null, { left: 0, top: 0, width: 10, height: 10 }))).toBeNull();
    expect(
      svgScreenMapping(
        svgWith({ x: 0, y: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 10, height: 10 }),
      ),
    ).toBeNull();
  });
});
