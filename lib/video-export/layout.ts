import type { Positions } from '../webmscore-loader';

type Box = Positions['elements'][number];

export type VideoLayout = 'landscape' | 'portrait';

/** Where the page sits in the frame: pixels per score unit, the page's offset, and how much of it the frame shows. */
export interface FrameGeometry {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Height of the visible window in score units (the page height when the whole page fits). */
  readonly windowHeight: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
}

/**
 * Landscape scales the page to the frame's width and shows a window of it that scrolls; portrait fits the whole page
 * (centred) and only ever turns pages.
 */
export function frameGeometry(
  layout: VideoLayout,
  frame: { width: number; height: number },
  pageSize: { width: number; height: number },
): FrameGeometry {
  const { width: pageWidth, height: pageHeight } = pageSize;
  if (layout === 'portrait') {
    const scale = Math.min(frame.width / pageWidth, frame.height / pageHeight);
    return {
      scale,
      offsetX: (frame.width - pageWidth * scale) / 2,
      offsetY: (frame.height - pageHeight * scale) / 2,
      windowHeight: pageHeight,
      pageWidth,
      pageHeight,
    };
  }
  const scale = frame.width / pageWidth;
  return {
    scale,
    offsetX: 0,
    offsetY: 0,
    windowHeight: Math.min(pageHeight, frame.height / scale),
    pageWidth,
    pageHeight,
  };
}

/** One system (a line of measures) on a page, as the vertical band its measure boxes cover, in score units. */
export interface SystemRow {
  readonly page: number;
  readonly top: number;
  readonly bottom: number;
}

const boxTop = (box: Box) => box.y;
const boxBottom = (box: Box) => box.y + (box.height ?? box.sy ?? 0);

/**
 * The page's systems, from its measure boxes: boxes whose vertical bands overlap are one system. Returns the row of
 * every measure id, since the player needs "which line is this measure on" far more than the list of lines.
 */
export function systemRowsByMeasure(measures: readonly Box[]): Map<number, SystemRow> {
  const byPage = new Map<number, Box[]>();
  for (const box of measures) {
    const list = byPage.get(box.page);
    if (list) list.push(box);
    else byPage.set(box.page, [box]);
  }
  const rowOf = new Map<number, SystemRow>();
  for (const [page, boxes] of byPage) {
    const sorted = [...boxes].sort((a, b) => boxTop(a) - boxTop(b));
    let group: Box[] = [];
    let bottom = -Infinity;
    const flush = () => {
      if (group.length === 0) return;
      const row: SystemRow = {
        page,
        top: Math.min(...group.map(boxTop)),
        bottom: Math.max(...group.map(boxBottom)),
      };
      for (const box of group) rowOf.set(box.id, row);
      group = [];
    };
    for (const box of sorted) {
      // Overlap by more than half of the box's own height, so staves that merely touch stay in separate systems.
      const overlap = bottom - boxTop(box);
      if (group.length > 0 && overlap <= (box.height ?? box.sy ?? 0) * 0.5) flush();
      group.push(box);
      bottom = group.length === 1 ? boxBottom(box) : Math.max(bottom, boxBottom(box));
    }
    flush();
  }
  return rowOf;
}

/** Where a row's top sits in the window: a little below the top edge, so the line above stays partly in view. */
export const ROW_TOP_FRACTION = 0.1;

/**
 * The scroll position (score units) that shows `row`, given the current one: unchanged while the row is fully visible,
 * else the row's top placed near the window's top, clamped to the page. Scrolling only when it must keeps the picture
 * still (and the file small), and reads like turning a page of a part rather than a camera drifting.
 */
export function scrollForRow(
  row: SystemRow,
  current: number | null,
  geometry: FrameGeometry,
): number {
  const maxScroll = Math.max(0, geometry.pageHeight - geometry.windowHeight);
  const clamp = (value: number) => Math.min(maxScroll, Math.max(0, value));
  if (maxScroll === 0) return 0;
  if (current !== null) {
    const margin = geometry.windowHeight * ROW_TOP_FRACTION;
    const fits = row.bottom - row.top <= geometry.windowHeight - margin;
    if (
      fits &&
      row.top >= current &&
      row.bottom <= current + geometry.windowHeight - margin * 0.5
    ) {
      return clamp(current);
    }
  }
  const height = row.bottom - row.top;
  if (height >= geometry.windowHeight) return clamp(row.top - (geometry.windowHeight - height) / 2);
  return clamp(row.top - geometry.windowHeight * ROW_TOP_FRACTION);
}

/** Ease in and out, for the scroll between two rows. */
export const easeInOut = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};
