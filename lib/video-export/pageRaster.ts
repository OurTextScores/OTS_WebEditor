import type { PageImage } from './compositor';
import type { PageProvider } from './exportVideo';
import type { FrameGeometry } from './layout';
import { parseNoteShapes } from './noteShapes';

/** Draws an SVG document to a bitmap of exactly `width` x `height` pixels. Needs a DOM (an `Image` decodes SVG). */
export async function rasterizeSvg(
  svg: string,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.width = width;
    image.height = height;
    image.src = url;
    await image.decode();
    return await createImageBitmap(image, { resizeWidth: width, resizeHeight: height });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Pages of one score as `PageImage`s, produced on demand and freed when the export moves on. The engine lays a page out
 * when asked for its SVG (seconds on a dense page), so the next page is prefetched while the current one plays out.
 * Only the pages the export still needs are held: a 1080-wide page is about 20 MB.
 */
export function createPageProvider(
  renderSvg: (page: number) => Promise<string>,
  geometry: FrameGeometry,
): PageProvider & { get(page: number): PageImage } {
  const pending = new Map<number, Promise<PageImage>>();
  const ready = new Map<number, PageImage>();

  const load = (page: number): Promise<PageImage> => {
    const existing = pending.get(page);
    if (existing) return existing;
    const task = (async () => {
      const svg = await renderSvg(page);
      const bitmap = await rasterizeSvg(
        svg,
        Math.round(geometry.pageWidth * geometry.scale),
        Math.round(geometry.pageHeight * geometry.scale),
      );
      const image: PageImage = { bitmap, shapes: parseNoteShapes(svg) };
      ready.set(page, image);
      return image;
    })();
    pending.set(page, task);
    // A failed load must not be remembered, or a retry would see the same rejection.
    task.catch(() => pending.delete(page));
    return task;
  };

  return {
    async ensure(page) {
      await load(page);
    },
    prefetch(page) {
      void load(page).catch(() => undefined);
    },
    release(keep) {
      for (const [page, image] of ready) {
        if (keep.includes(page)) continue;
        (image.bitmap as unknown as ImageBitmap).close?.();
        ready.delete(page);
        pending.delete(page);
      }
    },
    get(page) {
      const image = ready.get(page);
      if (!image) throw new Error(`Page ${page} is not ready`);
      return image;
    },
  };
}
