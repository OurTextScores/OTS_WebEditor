import { Positions, Score } from '../../lib/webmscore-loader';

export const fetchMeasureSignatures = async (targetScore: Score, partIndex: number) => {
  const parseSignatures = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string');
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter((entry): entry is string => typeof entry === 'string');
        }
      } catch (err) {
        console.warn('Failed to parse measure signatures payload:', err);
      }
    }
    return null;
  };

  if (targetScore.measureSignatures) {
    const signatures = await targetScore.measureSignatures(partIndex);
    const parsed = parseSignatures(signatures);
    if (parsed && parsed.length > 0) {
      return parsed;
    }
    if (
      parsed &&
      parsed.length === 0 &&
      targetScore.measureSignatureCount &&
      targetScore.measureSignatureAt
    ) {
      const count = await targetScore.measureSignatureCount(partIndex);
      if (count > 0) {
        const fallback: string[] = [];
        for (let i = 0; i < count; i += 1) {
          fallback.push(await targetScore.measureSignatureAt(partIndex, i));
        }
        return fallback;
      }
      return parsed;
    }
    if (parsed) {
      return parsed;
    }
  }

  if (targetScore.measureSignatureCount && targetScore.measureSignatureAt) {
    const count = await targetScore.measureSignatureCount(partIndex);
    const signatures: string[] = [];
    for (let i = 0; i < count; i += 1) {
      signatures.push(await targetScore.measureSignatureAt(partIndex, i));
    }
    return signatures;
  }

  return [];
};

export const fetchMeasureLineBreaks = async (targetScore: Score) => {
  if (!targetScore.measureLineBreaks) {
    return [];
  }
  const breaks = await targetScore.measureLineBreaks();
  return Array.isArray(breaks) ? breaks.map(Boolean) : [];
};

export const applyMeasureLineBreaks = async (targetScore: Score, breaks: boolean[]) => {
  if (!targetScore.setMeasureLineBreaks) {
    return false;
  }
  return targetScore.setMeasureLineBreaks(breaks);
};

export const refreshMeasurePositions = async (
  targetScore: Score,
  setter: (positions: Positions | null) => void,
) => {
  if (!targetScore.measurePositions) {
    return false;
  }
  try {
    const positions = await targetScore.measurePositions();
    setter(positions ?? null);
    return true;
  } catch (err) {
    console.warn('Failed to load measure positions for compare highlight:', err);
    return false;
  }
};

export const getPageMeasureRange = async (targetScore: Score, pageIndex: number) => {
  if (typeof targetScore.measureRangeForPage !== 'function') {
    throw new Error('Current-page audio requires an updated webmscore build.');
  }
  const safePageIndex = Math.max(0, pageIndex || 0);
  const range = await Promise.resolve(targetScore.measureRangeForPage(safePageIndex));
  if (
    !range ||
    !Number.isFinite(range.startMeasureIndex) ||
    !Number.isFinite(range.endMeasureIndex)
  ) {
    throw new Error(`No measures found on page ${safePageIndex + 1}.`);
  }
  return range;
};

export const buildMeasureBounds = (positions: Positions | null, zoomValue: number) => {
  if (!positions || !positions.elements.length) {
    return [];
  }
  const pageHeight = positions.pageSize?.height ?? 0;
  return positions.elements.map((element) => {
    const rawHeight =
      typeof element.sy === 'number'
        ? element.sy
        : typeof element.height === 'number'
          ? element.height
          : 0;
    const needsPageOffset =
      pageHeight > 0 && element.page > 0 && element.y + rawHeight <= pageHeight * 1.2;
    const pageOffset = needsPageOffset ? element.page * pageHeight : 0;
    return {
      top: (element.y + pageOffset) * zoomValue,
      height: rawHeight * zoomValue,
    };
  });
};

export const hitTestMeasure = (
  positions: Positions | null,
  clientX: number,
  clientY: number,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  zoom: number,
): number => {
  if (!positions?.elements.length || !wrapperRef.current) return -1;
  const rect = wrapperRef.current.getBoundingClientRect();
  const scoreX = (clientX - rect.left) / zoom;
  const scoreY = (clientY - rect.top) / zoom;
  const pageHeight = positions.pageSize?.height ?? 0;
  // Exact hit first
  const exact = positions.elements.findIndex((el) => {
    const w = typeof el.sx === 'number' ? el.sx : (el.width ?? 0);
    const h = typeof el.sy === 'number' ? el.sy : (el.height ?? 0);
    const needsPageOffset = pageHeight > 0 && el.page > 0 && el.y + h <= pageHeight * 1.2;
    const pageOffset = needsPageOffset ? el.page * pageHeight : 0;
    const y = el.y + pageOffset;
    return scoreX >= el.x && scoreX <= el.x + w && scoreY >= y && scoreY <= y + h;
  });
  if (exact >= 0) return exact;
  // Nearest fallback: closest measure by 2D distance to its centre
  let bestIdx = -1;
  let bestDist = Infinity;
  positions.elements.forEach((el, idx) => {
    const w = typeof el.sx === 'number' ? el.sx : (el.width ?? 0);
    const h = typeof el.sy === 'number' ? el.sy : (el.height ?? 0);
    const needsPageOffset = pageHeight > 0 && el.page > 0 && el.y + h <= pageHeight * 1.2;
    const pageOffset = needsPageOffset ? el.page * pageHeight : 0;
    const cy = el.y + pageOffset + h / 2;
    const cx = el.x + w / 2;
    const dist = (scoreX - cx) ** 2 + (scoreY - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  });
  return bestIdx;
};
