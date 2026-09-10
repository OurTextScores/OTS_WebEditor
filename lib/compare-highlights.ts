import type { Positions } from './webmscore-loader';
import { EMPTY_STAFF_BANDS, resolvePartBand, type StaffBands } from './compare-staff-bands';
import type {
  ChangeReviewBar,
  ChangeReviewScoreRegion,
} from '@/components/score-editor/compare/compare-types';
import type {
  ScannerComponentDifference,
  ScannerSymbolDifference,
} from '@/components/score-editor/compare/ScannerSystemRows';

export function sortChangeReviewRegionsByMeasure(regions: ChangeReviewScoreRegion[]) {
  return [...regions].sort((a, b) => {
    const aIndex = a.headMeasureIndex ?? a.baseMeasureIndex ?? Number.MAX_SAFE_INTEGER;
    const bIndex = b.headMeasureIndex ?? b.baseMeasureIndex ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || a.partIndex - b.partIndex;
  });
}

/** Locate one part's measure within a system using real staff bands when available. */
export function localizeMeasureToPart(
  element: {
    x: number;
    y: number;
    sx?: number;
    sy?: number;
    width?: number;
    height?: number;
    page: number;
  },
  partIndex: number,
  partCount: number,
  pageHeight: number,
  zoomValue: number,
  staffBands: StaffBands,
) {
  const rawWidth =
    typeof element.sx === 'number'
      ? element.sx
      : typeof element.width === 'number'
        ? element.width
        : 0;
  const rawHeight =
    typeof element.sy === 'number'
      ? element.sy
      : typeof element.height === 'number'
        ? element.height
        : 0;
  const withPageOffset = (y: number, height: number, page: number) => {
    const needsPageOffset = pageHeight > 0 && page > 0 && y + height <= pageHeight * 1.2;
    return y + (needsPageOffset ? page * pageHeight : 0);
  };

  const band = resolvePartBand(staffBands, element.page, element.y, rawHeight, partIndex);
  if (band) {
    return {
      left: element.x * zoomValue,
      top: withPageOffset(band.y, band.height, element.page) * zoomValue,
      width: rawWidth * zoomValue,
      height: band.height * zoomValue,
      geometry: 'staff' as const,
    };
  }

  const partHeight = rawHeight / partCount;
  return {
    left: element.x * zoomValue,
    top: (withPageOffset(element.y, rawHeight, element.page) + partHeight * partIndex) * zoomValue,
    width: rawWidth * zoomValue,
    height: partHeight * zoomValue,
    geometry: 'even' as const,
  };
}

export function buildPartLocalizedAlignmentHighlights(
  positions: Positions | null,
  entries: Array<{ partIndex: number; measureIndex: number }>,
  status: 'old-diff' | 'new-diff' | 'commented',
  zoomValue: number,
  partCount: number,
  staffBands: StaffBands = EMPTY_STAFF_BANDS,
) {
  if (!positions?.elements.length || partCount <= 0) return [];
  const pageHeight = positions.pageSize?.height ?? 0;
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    if (entry.partIndex < 0 || entry.partIndex >= partCount) return [];
    const key = `${entry.partIndex}:${entry.measureIndex}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const element = positions.elements[entry.measureIndex];
    if (!element) return [];
    return [
      {
        id: `align-${key}`,
        status,
        ...localizeMeasureToPart(
          element,
          entry.partIndex,
          partCount,
          pageHeight,
          zoomValue,
          staffBands,
        ),
      },
    ];
  });
}

export function buildPartLocalizedChangeReviewHighlights(
  positions: Positions | null,
  regions: ChangeReviewScoreRegion[],
  side: 'base' | 'head',
  zoomValue: number,
  partCount: number,
  staffBands: StaffBands = EMPTY_STAFF_BANDS,
) {
  if (!positions?.elements.length || partCount <= 0) return [];
  const pageHeight = positions.pageSize?.height ?? 0;
  return regions.flatMap((region) => {
    const measureIndex = side === 'base' ? region.baseMeasureIndex : region.headMeasureIndex;
    if (measureIndex === undefined || region.partIndex < 0 || region.partIndex >= partCount) {
      return [];
    }
    const element = positions.elements[measureIndex];
    if (!element) return [];
    return [
      {
        id: `${region.anchorId}-${side}`,
        status: side === 'base' ? ('old-diff' as const) : ('new-diff' as const),
        ...localizeMeasureToPart(
          element,
          region.partIndex,
          partCount,
          pageHeight,
          zoomValue,
          staffBands,
        ),
      },
    ];
  });
}

export type SuppliedCompareRegion = {
  blockIndex: number;
  leftPartIndex?: number;
  rightPartIndex?: number;
  leftMeasureIndexes: number[];
  rightMeasureIndexes: number[];
  differenceClasses?: string[];
  grounded?: boolean;
  contentSignature?: string;
  leftMarkings?: { dynamics: boolean; lyrics: boolean };
  rightMarkings?: { dynamics: boolean; lyrics: boolean };
  symbolDifferences?: ScannerSymbolDifference[];
  componentDifferences?: ScannerComponentDifference[];
};

export function buildPartLocalizedSuppliedHighlights(
  positions: Positions | null,
  regions: SuppliedCompareRegion[],
  side: 'left' | 'right',
  zoomValue: number,
  partCount: number,
  staffBands: StaffBands = EMPTY_STAFF_BANDS,
) {
  if (!positions?.elements.length || partCount <= 0) return [];
  const pageHeight = positions.pageSize?.height ?? 0;
  return regions.flatMap((region) => {
    const partIndex = side === 'left' ? region.leftPartIndex : region.rightPartIndex;
    const measureIndexes = side === 'left' ? region.leftMeasureIndexes : region.rightMeasureIndexes;
    if (partIndex === undefined || partIndex < 0 || partIndex >= partCount) return [];
    return measureIndexes.flatMap((measureIndex) => {
      const element = positions.elements[measureIndex];
      if (!element) return [];
      return [
        {
          id: `supplied-${region.blockIndex}-${side}-${measureIndex}`,
          status: side === 'left' ? ('old-diff' as const) : ('new-diff' as const),
          ...localizeMeasureToPart(
            element,
            partIndex,
            partCount,
            pageHeight,
            zoomValue,
            staffBands,
          ),
        },
      ];
    });
  });
}

export function buildPartLocalizedChangeReviewBarHighlights(
  positions: Positions | null,
  bars: ChangeReviewBar[],
  side: 'base' | 'head',
  zoomValue: number,
  partCount: number,
  staffBands: StaffBands = EMPTY_STAFF_BANDS,
) {
  if (!positions?.elements.length || partCount <= 0) return [];
  const pageHeight = positions.pageSize?.height ?? 0;
  return bars.flatMap((bar) => {
    if (bar.side !== side || bar.partIndex < 0 || bar.partIndex >= partCount) return [];
    const element = positions.elements[bar.measureIndex];
    if (!element) return [];
    return [
      {
        id: `${bar.anchorId}-${side}`,
        ...localizeMeasureToPart(
          element,
          bar.partIndex,
          partCount,
          pageHeight,
          zoomValue,
          staffBands,
        ),
      },
    ];
  });
}
