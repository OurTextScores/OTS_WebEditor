import { describe, expect, it } from 'vitest';
import { createCompositor, type PageImage } from '../../lib/video-export/compositor';
import type { FrameState } from '../../lib/video-export/framePlan';
import { frameGeometry } from '../../lib/video-export/layout';
import { parseNoteShapes } from '../../lib/video-export/noteShapes';

const HEAD = 'M0,4 C0,8 3,13 11,13 C21,13 32,4 32,-4 C32,-9 27,-13 21,-13 C11,-13 0,-5 0,4';
const svg = `<path class="Note" transform="matrix(1,0,0,1,500,300)" d="${HEAD}"/><path class="Note" transform="matrix(1,0,0,1,900,300)" d="${HEAD}"/>`;

function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => {
      if (['fillRect', 'strokeRect', 'drawImage', 'setTransform', 'fill'].includes(prop)) {
        return (...args: unknown[]) => calls.push([prop, ...args]);
      }
      return target[prop];
    },
    set: (target, prop: string, value) => {
      target[prop] = value;
      if (['fillStyle', 'globalAlpha', 'strokeStyle'].includes(prop))
        calls.push([`set ${prop}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const frame = { width: 1000, height: 562 };
const page = { width: 2000, height: 3000 };
const geometry = frameGeometry('landscape', frame, page); // scale 0.5, window 1124
const image = (): PageImage => ({
  bitmap: { width: 1000, height: 1500 } as unknown as PageImage['bitmap'],
  shapes: parseNoteShapes(svg),
});
const state = (over: Partial<FrameState> = {}): FrameState => ({
  page: 0,
  scrollY: 0,
  turn: null,
  active: null,
  cursor: null,
  activeIsNote: false,
  ...over,
});
const makePath = (d: string) => ({ d }) as unknown as Path2D;
const measureBox = { id: 0, page: 0, x: 400, y: 200, sx: 600, sy: 300, width: 600, height: 300 };
const noteBox = { id: 7, page: 0, x: 490, y: 250, sx: 60, sy: 120, width: 60, height: 120 };

describe('createCompositor', () => {
  it('clears to the background and blits the scrolled crop of the page', () => {
    const { ctx, calls } = recorder();
    createCompositor(ctx, frame, geometry, image, undefined, makePath).draw(
      state({ scrollY: 400 }),
    );
    expect(calls.find((c) => c[0] === 'fillRect')).toEqual(['fillRect', 0, 0, 1000, 562]);
    // scrollY 400 units * 0.5 = 200 px down; the frame shows 562 rows of it.
    expect(calls.find((c) => c[0] === 'drawImage')).toEqual([
      'drawImage',
      expect.anything(),
      0,
      200,
      1000,
      562,
      0,
      0,
      1000,
      562,
    ]);
  });

  it('crops to what is left at the bottom of the page', () => {
    const { ctx, calls } = recorder();
    createCompositor(ctx, frame, geometry, image, undefined, makePath).draw(
      state({ scrollY: 2800 }),
    );
    const blit = calls.find((c) => c[0] === 'drawImage')!;
    expect(blit[5]).toBe(100); // 1500 - 1400
    expect(blit[3]).toBe(1400);
  });

  it('draws a measure as a box in frame pixels, scrolled with the page', () => {
    const { ctx, calls } = recorder();
    createCompositor(ctx, frame, geometry, image, undefined, makePath).draw(
      state({ scrollY: 100, active: measureBox }),
    );
    const boxCalls = calls.filter((c) => c[0] === 'fillRect' || c[0] === 'strokeRect').slice(1);
    expect(boxCalls[0]).toEqual(['fillRect', 200, 50, 300, 150]);
    expect(boxCalls[1]).toEqual(['strokeRect', 200, 50, 300, 150]);
  });

  it('colours the sounding notehead through the page scale and scroll, and only that chord', () => {
    const { ctx, calls } = recorder();
    createCompositor(ctx, frame, geometry, image, undefined, makePath).draw(
      state({ scrollY: 100, active: noteBox, activeIsNote: true }),
    );
    const transforms = calls.filter((c) => c[0] === 'setTransform');
    // reset, reset, then the one head at x=500 -> 250 px, y=(300-100)*0.5 = 100 px; the head at x=900 is another chord.
    expect(transforms.some((c) => c[1] === 0.5 && c[5] === 250 && c[6] === 100)).toBe(true);
    expect(calls.filter((c) => c[0] === 'fill')).toHaveLength(1);
    expect(calls.some((c) => c[0] === 'fillRect' && c[1] === 200)).toBe(false);
  });

  it('crossfades a page turn and holds the highlight until it has finished', () => {
    const { ctx, calls } = recorder();
    const draw = createCompositor(ctx, frame, geometry, image, undefined, makePath).draw;
    draw(
      state({
        page: 1,
        turn: { fromPage: 0, fromScrollY: 0, progress: 0.4 },
        active: { ...measureBox, page: 1 },
      }),
    );
    const alphas = calls.filter((c) => c[0] === 'set globalAlpha').map((c) => c[1]);
    expect(alphas).toContain(0.4);
    expect(calls.filter((c) => c[0] === 'drawImage')).toHaveLength(2);
    expect(calls.filter((c) => c[0] === 'strokeRect')).toHaveLength(0);
  });

  it('does not draw a highlight that is on another page', () => {
    const { ctx, calls } = recorder();
    createCompositor(ctx, frame, geometry, image, undefined, makePath).draw(
      state({ active: { ...measureBox, page: 3 } }),
    );
    expect(calls.filter((c) => c[0] === 'strokeRect')).toHaveLength(0);
  });

  it('places a portrait page at its centred offset', () => {
    const portrait = frameGeometry('portrait', { width: 1080, height: 1920 }, page);
    const { ctx, calls } = recorder();
    const small = {
      bitmap: { width: 1080, height: 1620 } as unknown as PageImage['bitmap'],
      shapes: [],
    };
    createCompositor(
      ctx,
      { width: 1080, height: 1920 },
      portrait,
      () => small,
      undefined,
      makePath,
    ).draw(state());
    const blit = calls.find((c) => c[0] === 'drawImage')!;
    expect(blit[6]).toBe(portrait.offsetX);
    expect(blit[7]).toBeCloseTo(portrait.offsetY);
  });

  it('draws the moving cursor on its own page, and not while a page turns', () => {
    const cursor = { page: 0, x: 600, y: 180, width: 4, height: 240 };
    const { ctx, calls } = recorder();
    createCompositor(ctx, frame, geometry, image, undefined, makePath).draw(state({ cursor }));
    // Page units scaled by 0.5 into the frame.
    expect(calls.filter((c) => c[0] === 'fillRect')).toContainEqual(['fillRect', 300, 90, 2, 120]);
    for (const over of [
      { cursor: { ...cursor, page: 1 } },
      { cursor, turn: { fromPage: 1, fromScrollY: 0, progress: 0.5 } },
    ]) {
      const recorded = recorder();
      createCompositor(recorded.ctx, frame, geometry, image, undefined, makePath).draw(state(over));
      expect(recorded.calls.filter((c) => c[0] === 'fillRect')).toHaveLength(1);
    }
  });
});
