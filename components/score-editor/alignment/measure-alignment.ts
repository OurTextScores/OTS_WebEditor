import { type MeasureAlignmentRow } from '../compare/compare-reflow-plan';

export const buildMismatchBlocks = (rows: MeasureAlignmentRow[]) => {
  const blocks: Array<{ start: number; end: number }> = [];
  let start = -1;
  rows.forEach((row, index) => {
    const mismatch = !row.match;
    if (mismatch && start === -1) {
      start = index;
    }
    if (!mismatch && start !== -1) {
      blocks.push({ start, end: index - 1 });
      start = -1;
    }
  });
  if (start !== -1) {
    blocks.push({ start, end: rows.length - 1 });
  }
  return blocks;
};

export const buildMismatchBreaks = (
  rows: MeasureAlignmentRow[],
  side: 'left' | 'right',
  measureCount: number,
) => {
  const breaks = Array.from({ length: measureCount }, () => false);
  if (!rows.length || measureCount <= 0) {
    return breaks;
  }
  const blocks = buildMismatchBlocks(rows);
  for (const block of blocks) {
    let startIndex: number | null = null;
    let endIndex: number | null = null;
    for (let i = block.start; i <= block.end; i += 1) {
      const index = side === 'left' ? rows[i].leftIndex : rows[i].rightIndex;
      if (index === null) {
        continue;
      }
      if (startIndex === null) {
        startIndex = index;
      }
      endIndex = index;
    }
    if (startIndex === null || endIndex === null) {
      continue;
    }
    if (startIndex > 0 && startIndex - 1 < measureCount) {
      breaks[startIndex - 1] = true;
    }
    if (endIndex >= 0 && endIndex < measureCount) {
      breaks[endIndex] = true;
    }
  }
  return breaks;
};

export const buildIndexAlignment = (left: string[], right: string[]): MeasureAlignmentRow[] => {
  const total = Math.max(left.length, right.length);
  const rows: MeasureAlignmentRow[] = [];
  for (let i = 0; i < total; i += 1) {
    const leftIndex = i < left.length ? i : null;
    const rightIndex = i < right.length ? i : null;
    const match =
      leftIndex !== null && rightIndex !== null && left[leftIndex] === right[rightIndex];
    rows.push({ leftIndex, rightIndex, match });
  }
  return rows;
};

export const normalizeAlignmentRows = (rows: MeasureAlignmentRow[]) => {
  const normalized: MeasureAlignmentRow[] = [];
  let pendingLeft: number[] = [];
  let pendingRight: number[] = [];

  const flush = () => {
    const pairCount = Math.min(pendingLeft.length, pendingRight.length);
    for (let i = 0; i < pairCount; i += 1) {
      normalized.push({
        leftIndex: pendingLeft[i],
        rightIndex: pendingRight[i],
        match: false,
      });
    }
    for (let i = pairCount; i < pendingLeft.length; i += 1) {
      normalized.push({ leftIndex: pendingLeft[i], rightIndex: null, match: false });
    }
    for (let i = pairCount; i < pendingRight.length; i += 1) {
      normalized.push({ leftIndex: null, rightIndex: pendingRight[i], match: false });
    }
    pendingLeft = [];
    pendingRight = [];
  };

  rows.forEach((row) => {
    if (row.match || (row.leftIndex !== null && row.rightIndex !== null)) {
      flush();
      normalized.push(row);
      return;
    }
    if (row.leftIndex !== null) {
      pendingLeft.push(row.leftIndex);
    }
    if (row.rightIndex !== null) {
      pendingRight.push(row.rightIndex);
    }
  });
  flush();
  return normalized;
};

export const buildLcsAlignment = (left: string[], right: string[]) => {
  const n = left.length;
  const m = right.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      if (left[i] === right[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i][j + 1], dp[i + 1][j]);
      }
    }
  }

  const rows: MeasureAlignmentRow[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (left[i - 1] === right[j - 1]) {
      rows.push({ leftIndex: i - 1, rightIndex: j - 1, match: true });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      rows.push({ leftIndex: i - 1, rightIndex: null, match: false });
      i -= 1;
    } else {
      rows.push({ leftIndex: null, rightIndex: j - 1, match: false });
      j -= 1;
    }
  }
  while (i > 0) {
    rows.push({ leftIndex: i - 1, rightIndex: null, match: false });
    i -= 1;
  }
  while (j > 0) {
    rows.push({ leftIndex: null, rightIndex: j - 1, match: false });
    j -= 1;
  }

  rows.reverse();
  const lcsLength = dp[n][m];
  const maxLen = Math.max(n, m);
  const lcsRatio = maxLen > 0 ? lcsLength / maxLen : 0;
  return { rows: normalizeAlignmentRows(rows), lcsRatio };
};
