import type { FrameState } from './framePlan';
import type { FrameGeometry } from './layout';
import { shapesInBox, type NoteShape } from './noteShapes';

/** One rasterised page and the noteheads on it. The bitmap is `pageWidth * geometry.scale` pixels wide. */
export interface PageImage {
  readonly bitmap: CanvasImageSource & { readonly width: number; readonly height: number };
  readonly shapes: readonly NoteShape[];
}

export type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CompositorStyle {
  readonly background: string;
  /** Measure box fill and outline, and the notehead colour. */
  readonly measureFill: string;
  readonly measureStroke: string;
  readonly noteColor: string;
  readonly cursorColor: string;
}

export const DEFAULT_STYLE: CompositorStyle = {
  background: '#ffffff',
  measureFill: 'rgb(8 145 178 / 0.13)',
  measureStroke: 'rgb(8 145 178 / 0.8)',
  noteColor: 'rgb(8 145 178)',
  cursorColor: 'rgb(8 145 178)',
};

export interface Compositor {
  /** Draws `state` onto the canvas. Every page it names must be available from `pageOf`. */
  draw(state: FrameState): void;
}

/**
 * Paints frames from a plan's state: the page (a crop of its raster, scrolled), a crossfade while turning, and the
 * highlight over it, in the same colours as the player. `pageOf` is read synchronously; the orchestrator makes the
 * pages ready first. `makePath` exists for tests (jsdom has no Path2D).
 */
export function createCompositor(
  ctx: Context2D,
  frame: { width: number; height: number },
  geometry: FrameGeometry,
  pageOf: (page: number) => PageImage,
  style: CompositorStyle = DEFAULT_STYLE,
  makePath: (d: string) => Path2D = (d) => new Path2D(d),
): Compositor {
  const { scale, offsetX, offsetY } = geometry;

  const drawPage = (page: number, scrollY: number, alpha: number) => {
    const image = pageOf(page);
    const sourceY = Math.max(0, Math.min(image.bitmap.height, scrollY * scale));
    const height = Math.min(image.bitmap.height - sourceY, frame.height - offsetY);
    if (height <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      image.bitmap,
      0,
      sourceY,
      image.bitmap.width,
      height,
      offsetX,
      offsetY,
      image.bitmap.width,
      height,
    );
    ctx.globalAlpha = 1;
  };

  return {
    draw(state) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = style.background;
      ctx.fillRect(0, 0, frame.width, frame.height);

      if (state.turn) {
        drawPage(state.turn.fromPage, state.turn.fromScrollY, 1);
        drawPage(state.page, state.scrollY, state.turn.progress);
      } else {
        drawPage(state.page, state.scrollY, 1);
      }

      // Highlight and cursor belong to the page they are on; mid-turn the old page fades out under them, so they wait.
      if (state.turn && state.turn.progress < 1) return;
      const cursor = state.cursor;
      if (cursor && cursor.page === state.page) {
        ctx.fillStyle = style.cursorColor;
        ctx.fillRect(
          offsetX + cursor.x * scale,
          offsetY + (cursor.y - state.scrollY) * scale,
          Math.max(1, cursor.width * scale),
          cursor.height * scale,
        );
      }
      const box = state.active;
      if (!box || box.page !== state.page) return;

      if (state.activeIsNote) {
        ctx.fillStyle = style.noteColor;
        ctx.strokeStyle = style.noteColor;
        for (const shape of shapesInBox(pageOf(state.page).shapes, box)) {
          const [a, b, c, d, e, f] = shape.matrix;
          ctx.setTransform(
            a * scale,
            b * scale,
            c * scale,
            d * scale,
            offsetX + e * scale,
            offsetY + (f - state.scrollY) * scale,
          );
          const path = makePath(shape.d);
          ctx.fill(path);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return;
      }
      const x = offsetX + box.x * scale;
      const y = offsetY + (box.y - state.scrollY) * scale;
      const width = (box.width ?? box.sx ?? 0) * scale;
      const height = (box.height ?? box.sy ?? 0) * scale;
      ctx.fillStyle = style.measureFill;
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = style.measureStroke;
      ctx.lineWidth = Math.max(1, 2 * scale);
      ctx.strokeRect(x, y, width, height);
    },
  };
}
