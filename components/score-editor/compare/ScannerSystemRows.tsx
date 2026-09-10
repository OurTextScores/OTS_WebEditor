'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { FloatingPalettes } from '../../FloatingPalettes';
import { scorePaletteMutation, type ScorePaletteItem } from '../../toolbar/palette';
import {
  loadWebMscore,
  type IrregularMeasure,
  type Positions,
  type Score,
} from '@/lib/webmscore-loader';
import { routeCompareKeyboardShortcut } from './compare-keyboard-policy';
import type { CompareSide, CompareTransportState } from './compare-types';
import type { CompareTransport } from './useCompareTransport';
import {
  measureCount,
  useMergedScoreDocument,
  type MergedScoreState,
} from './useMergedScoreDocument';

/**
 * The scan's systems, with each engine's measures and a crop of the source page.
 * `cropUrl` is relative to the regions document it came from.
 */
export type ScannerSystem = {
  systemIndex: number;
  /** Semantic bounds of the system's measure evidence on the source page. */
  region?: [number, number, number, number];
  /** Exact padded, clamped bounds returned by `cropUrl`. */
  cropRegion?: [number, number, number, number];
  cropUrl?: string;
  leftMeasureIndexes: number[];
  rightMeasureIndexes: number[];
  staffRows?: Array<{
    stablePartKey: string;
    staffIndices: number[];
    region: [number, number, number, number];
    leftPartIndex?: number;
    rightPartIndex?: number;
    leftMeasureIndexes: number[];
    rightMeasureIndexes: number[];
  }>;
};

export type ScannerRowRegion = {
  blockIndex: number;
  stablePartKey?: string;
  leftPartIndex?: number;
  rightPartIndex?: number;
  leftMeasureIndexes: number[];
  rightMeasureIndexes: number[];
  differenceClasses?: string[];
  grounded?: boolean;
  /**
   * Required to decide this block, and withheld by the scanner for any block
   * whose place on the scan could not be proven — so an ungrounded decision
   * cannot be expressed rather than merely being discouraged.
   */
  contentSignature?: string;
  /**
   * What each side actually has to give. A difference class says the two
   * readings disagree about dynamics; it does not say which one has any, and
   * a control offering to take dynamics from a bar with none is worse than no
   * control at all.
   */
  leftMarkings?: { dynamics: boolean; lyrics: boolean };
  rightMarkings?: { dynamics: boolean; lyrics: boolean };
  /**
   * Which events inside each bar are unmatched, so the reader is pointed at
   * the note rather than at the bar containing it.
   */
  symbolDifferences?: ScannerSymbolDifference[];
  /** Concrete normalized facts present only in one reading. */
  componentDifferences?: ScannerComponentDifference[];
  /** How a reader would name the bars this covers, per side. */
  leftMeasureLabel?: string;
  rightMeasureLabel?: string;
  /** Where it sits inside its system's scan crop, as fractions of that crop. */
  cropBoxes?: Array<{
    systemIndex: number;
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
};

export type ScannerSymbolDifference = {
  leftMeasureIndex: number;
  rightMeasureIndex: number;
  leftEventIndexes: number[];
  rightEventIndexes: number[];
  /** Totals, so a mismatched idea of "an event" can be detected, not trusted. */
  leftEventCount: number;
  rightEventCount: number;
};

export type ScannerComponentDifference = {
  leftMeasureIndex: number;
  rightMeasureIndex: number;
  leftMeasureLabel?: string;
  rightMeasureLabel?: string;
  component: string;
  leftOnly: string[];
  rightOnly: string[];
  leftOmitted?: number;
  rightOmitted?: number;
};

const DIFFERENCE_LABELS: Record<string, string> = {
  notation: 'notes or rhythm',
  voice: 'voices',
  staff: 'staff assignment',
  attributes: 'clef, key, time or divisions',
  lyrics: 'lyrics',
  dynamics: 'dynamics',
  directions: 'directions',
  notations: 'slurs, ties or other notation',
  'measure-added': 'only in the second reading',
  'measure-removed': 'only in the first reading',
};

function detailList(values: readonly string[], omitted = 0): string {
  const shown = values.join('; ');
  return omitted > 0 ? `${shown}${shown ? '; ' : ''}… (${omitted} more)` : shown;
}

/**
 * Say what changed, using the same concrete-delta pattern as change review.
 * Coarse classes remain a fallback for retained responses without details and
 * for a semantic change whose normalized facts cannot safely explain it.
 */
export function scannerRegionDifferenceDescriptions(
  region: ScannerRowRegion,
  leftLabel: string,
  rightLabel: string,
): string[] {
  const descriptions: string[] = [];
  const covered = new Set<string>();
  for (const difference of region.componentDifferences || []) {
    covered.add(difference.component);
    const measure =
      difference.leftMeasureLabel ||
      difference.rightMeasureLabel ||
      `bar ${Math.min(difference.leftMeasureIndex, difference.rightMeasureIndex) + 1}`;
    const left = detailList(difference.leftOnly || [], difference.leftOmitted || 0);
    const right = detailList(difference.rightOnly || [], difference.rightOmitted || 0);
    const sides = [
      left ? `${leftLabel} only: ${left}` : '',
      right ? `${rightLabel} only: ${right}` : '',
    ].filter(Boolean);
    if (sides.length > 0) {
      descriptions.push(
        `${measure} · ${DIFFERENCE_LABELS[difference.component] || difference.component} — ${sides.join(' · ')}`,
      );
    }
  }

  const classes = [...new Set(region.differenceClasses || [])];
  if (classes.includes('measure-removed')) {
    descriptions.push(`${region.leftMeasureLabel || 'A measure'} appears only in ${leftLabel}`);
    covered.add('measure-removed');
  }
  if (classes.includes('measure-added')) {
    descriptions.push(`${region.rightMeasureLabel || 'A measure'} appears only in ${rightLabel}`);
    covered.add('measure-added');
  }
  const unexplained = classes.filter((name) => !covered.has(name));
  if (unexplained.length > 0) {
    descriptions.push(unexplained.map((name) => DIFFERENCE_LABELS[name] || name).join(', '));
  }
  return descriptions;
}

/** Width each engine's score is rendered at before being clipped into rows. */
const RENDER_WIDTH = 1400;
const HORIZONTAL_PANE_WIDTH = 520;

type ScannerRowLayout = 'horizontal' | 'vertical';
type ScannerPane = 'scan' | 'left' | 'merged' | 'right';

/**
 * Force this engine's line breaks onto the scan's system boundaries.
 *
 * The rows are the scanned page's systems, not either engine's — they break
 * differently, and the question being reviewed is what the page says. Measured
 * before being relied on: MuseScore honoured every forced break on both
 * engines, and forcing fewer measures per line than an engine would choose
 * stretches rather than crowds. See the design's §2.1.
 */
/**
 * Where a line starts in the merged document, given where it started in the
 * reading the merge was built from.
 *
 * `map[mergedPosition] = sourceMeasureIndex`, so following a start is a lookup
 * by value. A start whose bar is gone — removed by an earlier decision — drops
 * out rather than breaking at whatever now sits at that number: one line too
 * few is a smaller lie than a line that begins in the wrong place.
 */
export function lineStartsInMerge(
  starts: readonly number[],
  map: readonly (number | null)[] | undefined,
): number[] {
  if (!map) return [...starts];
  return starts.map((start) => map.indexOf(start)).filter((position) => position >= 0);
}

export function withForcedSystemBreaks(xml: string, startMeasureIndexes: number[]): string {
  if (typeof DOMParser === 'undefined' || startMeasureIndexes.length === 0) return xml;
  const starts = new Set(startMeasureIndexes.filter((index) => index > 0));
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return xml;
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    Array.from(part.children)
      .filter((child) => child.tagName === 'measure')
      .forEach((measure, index) => {
        // Whatever the engine wanted is discarded: the scan decides.
        Array.from(measure.getElementsByTagName('print')).forEach((node) =>
          node.parentElement === measure ? measure.removeChild(node) : undefined,
        );
        if (!starts.has(index)) return;
        const print = doc.createElement('print');
        print.setAttribute('new-system', 'yes');
        measure.insertBefore(print, measure.firstChild);
      });
  }
  return new XMLSerializer().serializeToString(doc);
}

type MeasureBox = {
  left: number;
  width: number;
  top: number;
  height: number;
  page?: number;
};

type RenderedSide = {
  svg: string;
  /** Pixel bounds per measure index, at RENDER_WIDTH. */
  measures: Array<MeasureBox | undefined>;
  /**
   * Every rhythmic position in the drawing, left to right, at RENDER_WIDTH.
   *
   * Kept flat and unattributed because a segment does not say which bar it
   * belongs to; the bar it falls inside decides that, and only at the point
   * of use, where the measure box is already in hand.
   */
  segments: MeasureBox[];
  staffBands: Array<{
    page: number;
    partIndex: number;
    top: number;
    height: number;
  }>;
  width: number;
  /** Page height in the same scaled pixels, so a click can find its page. */
  pageHeight: number;
  /** RENDER_WIDTH / pageWidth: undoes the scaling to reach score coordinates. */
  renderScale: number;
};

function measureBounds(positions: Positions | null, scale: number): Array<MeasureBox | undefined> {
  if (!positions?.elements?.length) return [];
  const pageHeight = positions.pageSize?.height ?? 0;
  return positions.elements.map((element) => {
    const rawHeight = typeof element.sy === 'number' ? element.sy : (element.height ?? 0);
    const rawWidth = typeof element.sx === 'number' ? element.sx : (element.width ?? 0);
    // Endless layout still reports per-page coordinates, so a later page's
    // measures would otherwise stack on top of the first.
    const needsPageOffset =
      pageHeight > 0 && element.page > 0 && element.y + rawHeight <= pageHeight * 1.2;
    const top = (element.y + (needsPageOffset ? element.page * pageHeight : 0)) * scale;
    return {
      left: element.x * scale,
      width: rawWidth * scale,
      top,
      height: rawHeight * scale,
      page: element.page,
    };
  });
}

/**
 * Draw the score's page at exactly `RENDER_WIDTH`.
 *
 * The measure coordinates below are scaled by `RENDER_WIDTH / pageWidth`, so
 * unless the SVG is drawn at that same width the clip windows point at the
 * wrong part of the page — which renders every row blank, since the systems sit
 * outside the visible band.
 */
function svgAtRenderWidth(svg: string): string {
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    const withoutSize = tag
      .replace(/\swidth="[^"]*"/i, '')
      .replace(/\sheight="[^"]*"/i, '')
      .replace(/\spreserveAspectRatio="[^"]*"/i, '');
    return withoutSize.replace(
      /^<svg/,
      `<svg width="${RENDER_WIDTH}" preserveAspectRatio="xMinYMin meet"`,
    );
  });
}

/**
 * Where a reading's bars belong under the merged score's line.
 *
 * The merged pane draws its whole line across the pane, which fixes a scale and
 * an origin for the row. An engine pane showing only the contested bars should
 * appear at that same scale, over the merged bars it would replace — so the
 * reader compares by looking up and down a column rather than across two
 * differently-zoomed pictures of the same music.
 *
 * Null when there is nothing to line up against: the merged score does not draw
 * this line, or the bars in question are not in it. The pane then fills its own
 * width, which is what it did before there was anything to align to.
 */
export function placeUnderMerged(
  merged: RenderedSide | null,
  mergedIndexes: readonly number[],
  ownIndexes: readonly number[],
  paneWidth: number,
): { left: number; width: number } | null {
  if (!merged || paneWidth <= 0 || mergedIndexes.length === 0 || ownIndexes.length === 0) {
    return null;
  }
  const boxesFor = (indexes: readonly number[]) =>
    indexes.map((index) => merged.measures[index]).filter((box): box is MeasureBox => Boolean(box));
  const lineBoxes = boxesFor(mergedIndexes);
  const targetBoxes = boxesFor(ownIndexes);
  if (lineBoxes.length === 0 || targetBoxes.length === 0) return null;

  const lineLeft = Math.min(...lineBoxes.map((box) => box.left));
  const lineRight = Math.max(...lineBoxes.map((box) => box.left + box.width));
  const lineWidth = Math.max(1, lineRight - lineLeft);
  const scale = paneWidth / lineWidth;

  const targetLeft = Math.min(...targetBoxes.map((box) => box.left));
  const targetRight = Math.max(...targetBoxes.map((box) => box.left + box.width));
  return {
    left: (targetLeft - lineLeft) * scale,
    width: Math.max(1, (targetRight - targetLeft) * scale),
  };
}

/**
 * Where the unmatched events of one bar are drawn.
 *
 * The analysis counts events in a bar; this rendering knows where each
 * rhythmic position sits. Nothing connects them but the ordering, so the count
 * is checked first: if this drawing has a different number of positions in the
 * bar than the analysis found events, the two are not counting the same thing
 * and no box is returned. The row then stays marked at bar level, which is
 * true, rather than pointing confidently at the wrong note.
 */
function eventBoxes(
  rendered: RenderedSide | null,
  measureIndex: number,
  eventIndexes: readonly number[],
  eventCount: number,
): MeasureBox[] {
  const measure = rendered?.measures[measureIndex];
  if (!rendered || !measure || eventIndexes.length === 0) return [];
  const inside = rendered.segments
    .filter(
      (segment) =>
        segment.left >= measure.left - 1 &&
        segment.left < measure.left + measure.width &&
        segment.top + segment.height > measure.top &&
        segment.top < measure.top + measure.height,
    )
    .sort((left, right) => left.left - right.left);
  if (inside.length !== eventCount) {
    // Worth saying out loud rather than silently falling back: if this ever
    // fires on every bar of a page, the two sides have stopped counting the
    // same thing and symbol highlighting is off everywhere.
    console.debug(
      '[scanner-rows] symbol highlight skipped: measure',
      measureIndex,
      'has',
      inside.length,
      'drawn positions against',
      eventCount,
      'analysed events',
    );
    return [];
  }
  return eventIndexes.map((index) => inside[index]).filter(Boolean);
}

/**
 * The bars a pane should actually draw for one row.
 *
 * A system is up to a dozen bars and a difference is usually one or two of
 * them, so drawing the whole line spends most of the width on music both
 * readings agree about — and shrinks the bars in question to the point where
 * comparing a beam or an accidental means leaning at the screen. Narrowing to
 * the difference makes them as large as the pane allows.
 *
 * Only the two engine panes narrow. The scan is the context the whole
 * judgement rests on, and the merged score is the thing being built, which a
 * reviewer needs to see as a line rather than as a fragment of one.
 *
 * One bar of context either side, because a barline join is part of what a
 * reviewer is judging: whether a bar was split, and whether the bar after it
 * still starts where it should.
 *
 * A side with no bars in the difference — the empty half of an insertion or a
 * removal — keeps its whole line. There is nothing there to narrow to, and what
 * that side is *missing* can only be judged against what it has instead.
 */
export function focusedMeasureIndexes(
  systemIndexes: readonly number[],
  differenceIndexes: readonly number[],
  context = 1,
): number[] {
  if (differenceIndexes.length === 0) return [...systemIndexes];
  const wanted = new Set<number>();
  const ordered = [...systemIndexes].sort((left, right) => left - right);
  for (const index of differenceIndexes) {
    const position = ordered.indexOf(index);
    if (position < 0) {
      wanted.add(index);
      continue;
    }
    for (
      let step = Math.max(0, position - context);
      step <= Math.min(ordered.length - 1, position + context);
      step += 1
    ) {
      wanted.add(ordered[step]);
    }
  }
  const focused = ordered.filter((index) => wanted.has(index));
  return focused.length > 0 ? focused : [...systemIndexes];
}

/**
 * The bars of a line that were actually engraved on one row of it.
 *
 * A forced break starts a system; it does not stop the engine adding its own
 * when the bars do not fit the page. The merged pane is the only one that draws
 * a whole line, so it is the only one that can overflow, and the row then shows
 * the spilled bar underneath the line it belongs to — one line of music drawn
 * as two.
 *
 * Neither page width nor staff size fixes it. Measured on Klengel: quartering
 * the staff left the line split in exactly the same place, which is what says
 * this is not about how much fits.
 *
 * So the pane shows one engraved row rather than pretending the line is whole.
 * Which row is decided by the bars under review: the reader is here to judge a
 * difference, and a window that leaves it off screen is no use however tidy it
 * looks. Without a difference to hold onto, the first row wins, which is the
 * line as it reads.
 */
export function engravedRowWindow(
  rendered: RenderedSide | null,
  measureIndexes: readonly number[],
  contested: readonly number[] = [],
): number[] {
  if (!rendered || measureIndexes.length === 0) return [...measureIndexes];
  const placed = measureIndexes
    .map((index) => ({ index, box: rendered.measures[index] }))
    .filter((entry): entry is { index: number; box: MeasureBox } => Boolean(entry.box));
  if (placed.length === 0) return [...measureIndexes];

  const staff = Math.max(1, Math.min(...placed.map((entry) => entry.box.height)));
  const rows: Array<{ top: number; indexes: number[] }> = [];
  for (const entry of [...placed].sort((left, right) => left.box.top - right.box.top)) {
    const row = rows[rows.length - 1];
    // Half a staff apart is more than engraving jitter and less than a
    // system's spacing, so it separates rows without splitting one.
    if (row && entry.box.top - row.top <= staff / 2) row.indexes.push(entry.index);
    else rows.push({ top: entry.box.top, indexes: [entry.index] });
  }
  if (rows.length <= 1) return [...measureIndexes];

  const wanted = new Set(contested);
  const holdsAll = rows.find((row) => [...wanted].every((index) => row.indexes.includes(index)));
  const holdsSome = rows.find((row) => row.indexes.some((index) => wanted.has(index)));
  const chosen = holdsAll ?? holdsSome ?? rows[0];
  return [...chosen.indexes].sort((left, right) => left - right);
}

/**
 * Space the engraved systems apart, so a row has somewhere to breathe.
 *
 * A row clips a band around its staff and pads it, but the padding stops at the
 * halfway point to whatever is engraved next — otherwise a row would show a
 * slice of its neighbour, which is worse than a tight crop. On a page of ten
 * systems that halfway point is very close, so notes on high ledger lines lost
 * their heads and slurs and articulations were cut off entirely.
 *
 * The engraving is not for reading as a page — every system is clipped out of it
 * one at a time — so it can afford to be generous. More distance between systems
 * is more room for the band to grow into before it reaches its neighbour, and it
 * costs nothing else: unlike page width it does not touch justification, and
 * unlike staff size it does not change how much fits on a line.
 */
const SCANNER_SYSTEM_DISTANCE_TENTHS = 240;

export function withSystemSpacing(xml: string): string {
  if (typeof DOMParser === 'undefined') return xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return xml;
  const root = doc.documentElement;
  if (!root) return xml;

  let defaults = Array.from(root.children).find((child) => child.tagName === 'defaults');
  if (!defaults) {
    defaults = doc.createElement('defaults');
    // `<defaults>` follows the header blocks and precedes `<part-list>`.
    const partList = Array.from(root.children).find((child) => child.tagName === 'part-list');
    root.insertBefore(defaults, partList ?? root.firstChild);
  }
  const container = defaults;
  Array.from(container.getElementsByTagName('system-layout')).forEach((node) =>
    node.parentElement === container ? container.removeChild(node) : undefined,
  );
  // A `<print>` carrying its own system layout would override the default.
  Array.from(doc.getElementsByTagName('system-layout')).forEach((node) =>
    node.parentElement?.tagName === 'print' ? node.parentElement.removeChild(node) : undefined,
  );

  const layout = doc.createElement('system-layout');
  for (const [name, value] of [
    ['system-distance', SCANNER_SYSTEM_DISTANCE_TENTHS],
    ['top-system-distance', SCANNER_SYSTEM_DISTANCE_TENTHS / 2],
  ] as const) {
    const node = doc.createElement(name);
    node.textContent = String(value);
    layout.appendChild(node);
  }
  // Inside `<defaults>`, `<system-layout>` follows `<scaling>` and `<page-layout>`.
  const after = Array.from(container.children).filter((child) =>
    ['scaling', 'page-layout'].includes(child.tagName),
  );
  const anchor = after[after.length - 1];
  container.insertBefore(layout, anchor ? anchor.nextSibling : container.firstChild);
  return new XMLSerializer().serializeToString(doc);
}

/** `n/d` as a number, for comparing a bar's length against its time signature. */
export function fractionValue(value: string): number {
  const [numerator, denominator] = String(value).split('/');
  const top = Number(numerator);
  const bottom = Number(denominator);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0 ? top / bottom : NaN;
}

/**
 * Bars holding more than their time signature allows.
 *
 * Only the over-full ones. A bar holding *less* is very often right: a pickup
 * is short by definition, and so is the last bar of a piece that answers one.
 * Padding those out would be inventing rests where the music ends. A bar
 * holding more has no such reading — the engine put more into it than the time
 * signature has room for, which is a mistake every time.
 */
export function overfullMeasures(measures: readonly IrregularMeasure[]): IrregularMeasure[] {
  return measures.filter((measure) => {
    const actual = fractionValue(measure.actual);
    const nominal = fractionValue(measure.nominal);
    return Number.isFinite(actual) && Number.isFinite(nominal) && actual > nominal;
  });
}

/** A first short measure is a pickup even when an OMR engine omitted the marker. */
export function scannerMeasureIsPickup(measure: IrregularMeasure): boolean {
  const actual = fractionValue(measure.actual);
  const nominal = fractionValue(measure.nominal);
  return (
    measure.pickup === true ||
    (measure.index === 0 && Number.isFinite(actual) && Number.isFinite(nominal) && actual < nominal)
  );
}

export function scannerMeasureLabel(measure: IrregularMeasure): string {
  return scannerMeasureIsPickup(measure) ? 'pickup measure 0' : `bar ${measure.number}`;
}

/** Draw an already-loaded score; used for the merged document, which is live. */
async function renderScoreSide(
  score: Score,
  { highlightSelection = false }: { highlightSelection?: boolean } = {},
): Promise<RenderedSide | null> {
  /*
   * `highlightSelection` is how a selection becomes visible.
   *
   * MuseScore colours the selected elements itself and the colour comes back
   * in the SVG — the editor passes `true` here for exactly that reason, with
   * a note beside it saying the overlays it keeps are for interaction
   * feedback rather than for showing what is selected. This view passed
   * `false` and then wondered why clicking a note did nothing: it was
   * selecting correctly and drawing the score without the selection in it.
   *
   * Off for the engine panes, which are evidence and cannot be selected.
   */
  const svg = await score.saveSvg(0, true, highlightSelection);
  const positions = await score.measurePositions();
  const staffBands = await (async () => {
    try {
      return (await score.staffSystemBands?.()) || [];
    } catch {
      return [];
    }
  })();
  // Rhythmic positions, for pointing at a note rather than at the bar around
  // it. Optional: a build without it loses symbol highlighting and nothing
  // else, so it must not cost the rows their rendering.
  const segments = await (async () => {
    try {
      return await score.segmentPositions();
    } catch {
      return null;
    }
  })();
  const pageWidth = positions?.pageSize?.width || 0;
  const renderScale = pageWidth > 0 ? RENDER_WIDTH / pageWidth : 1;
  return {
    svg: svgAtRenderWidth(svg),
    measures: measureBounds(positions, renderScale),
    segments: measureBounds(segments, renderScale).filter((box): box is MeasureBox => Boolean(box)),
    staffBands: staffBands.map((band) => ({
      page: band.page,
      partIndex: band.partIndex,
      top: (band.y + band.page * (positions?.pageSize?.height || 0)) * renderScale,
      height: band.height * renderScale,
    })),
    width: RENDER_WIDTH,
    pageHeight: (positions?.pageSize?.height ?? 0) * renderScale,
    renderScale,
  };
}

/** Draw an engine reading. Its score is transient: engine panes are evidence. */
async function renderSide(xml: string, startIndexes: number[]): Promise<RenderedSide | null> {
  const WebMscore = await loadWebMscore();
  const reflowed = withSystemSpacing(withForcedSystemBreaks(xml, startIndexes));
  let score: Score | null = null;
  try {
    score = await WebMscore.load('xml', new TextEncoder().encode(reflowed));
    if (!score) return null;
    return await renderScoreSide(score);
  } finally {
    try {
      score?.destroy();
    } catch {
      // A score that will not close is not a reason to lose the rows.
    }
  }
}

type PaneGeometry = {
  /** Where the drawing starts inside the pane, in pane pixels. */
  offsetX: number;
  /** Left edge of the system's music, in RENDER_WIDTH pixels. */
  left: number;
  top: number;
  scale: number;
};

function SystemPane({
  rendered,
  measureIndexes,
  label,
  paneWidth,
  tone,
  onPointMutate,
  transport,
  onTogglePlay,
  onStop,
  highlights,
  preview,
  noteInput,
  place,
  partIndex,
}: {
  rendered: RenderedSide | null;
  measureIndexes: number[];
  label: string;
  paneWidth: number;
  tone?: 'merged';
  /** Playback state for this pane, when the workspace supplies a transport. */
  transport?: CompareTransportState;
  onTogglePlay?: () => void;
  onStop?: () => void;
  /** Unmatched events, in the same RENDER_WIDTH pixels as the drawing. */
  highlights?: MeasureBox[];
  /** Whole bars a hovered control is pointing at, in the same pixels. */
  preview?: MeasureBox[];
  /** Placing notes, so the pointer says so. Selecting is an ordinary click. */
  noteInput?: boolean;
  /**
   * Where in the pane this reading's bars should be drawn, in pane pixels.
   *
   * Absent means "fill the pane", which is right for the merged score: it is
   * the line, so it gets the width. An engine pane showing two contested bars
   * of a twelve-bar line would otherwise blow them up to the full width and
   * put them nowhere near the merged bars they replace — so it is handed the
   * box its counterpart occupies, and draws at that size, in that place.
   */
  place?: { left: number; width: number } | null;
  /** Limit this pane to one matched part in by-staff mode. */
  partIndex?: number;
  /**
   * Score-space coordinates of a click, for the one pane that is editable.
   * Absent on engine panes, which is what makes them read-only: there is no
   * path from a click to a mutation at all, rather than a disabled one.
   */
  onPointMutate?: (point: {
    page: number;
    x: number;
    y: number;
    measureIndex?: number;
    partIndex?: number;
  }) => void;
}) {
  /**
   * The pane measures itself rather than trusting a width from above.
   *
   * It used to be handed the scroll container's `clientWidth`, which includes
   * that container's padding and knows nothing about the row card's — so
   * every pane was scaled about 58px wider than the box it had to fit in, and
   * the music ran off the right edge of a clipped row. Measuring the element
   * the drawing actually lands in cannot drift from the layout, whatever
   * padding is added between here and the top.
   */
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const observed = useRef<ResizeObserver | null>(null);
  // A callback ref rather than an effect: a pane that first renders "no
  // measure here" and only later gets a layout attaches its node long after
  // mount, and an effect with an empty dependency list would never see it.
  const attachPane = useCallback((node: HTMLDivElement | null) => {
    observed.current?.disconnect();
    observed.current = null;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setMeasuredWidth(node.clientWidth));
    observer.observe(node);
    observed.current = observer;
    setMeasuredWidth(node.clientWidth);
  }, []);
  // The passed width is only a first-frame estimate, until the observer runs.
  const usableWidth = measuredWidth || paneWidth;

  if (measureIndexes.length === 0) {
    return (
      <div className="flex min-h-16 items-center rounded border border-dashed border-gray-300 px-3 text-xs text-gray-500">
        {label} has no measure here.
      </div>
    );
  }
  const localize = (box: MeasureBox | undefined): MeasureBox | undefined => {
    if (!box || partIndex === undefined || !rendered) return box;
    const band = rendered.staffBands
      .filter((entry) => entry.partIndex === partIndex && entry.page === (box.page || 0))
      .map((entry) => ({
        entry,
        overlap:
          Math.min(box.top + box.height, entry.top + entry.height) - Math.max(box.top, entry.top),
      }))
      .sort((left, right) => right.overlap - left.overlap)[0]?.entry;
    return band ? { ...box, top: band.top, height: band.height } : box;
  };
  const boxes = measureIndexes
    .map((index) => localize(rendered?.measures[index]))
    .filter((box): box is MeasureBox => Boolean(box));
  if (!rendered || boxes.length === 0) {
    return (
      <div className="flex min-h-16 items-center rounded border border-dashed border-gray-300 px-3 text-xs text-gray-500">
        {label} could not be laid out for this system.
      </div>
    );
  }
  const rawTop = Math.min(...boxes.map((box) => box.top));
  const rawBottom = Math.max(...boxes.map((box) => box.top + box.height));

  // A measure's reported box is the staff, and music leaves it: stems, ledger
  // lines and beams sit above and below. Clipping to the box alone slices the
  // notes off, so the band is padded — but only as far as the halfway point to
  // whatever is rendered next, so a row never shows part of its neighbour.
  const others = rendered.measures
    .map(localize)
    .filter(
      (box): box is MeasureBox =>
        Boolean(box) && (box!.top + box!.height <= rawTop || box!.top >= rawBottom),
    );
  const nearestAbove = others
    .filter((box) => box.top + box.height <= rawTop)
    .reduce((closest, box) => Math.max(closest, box.top + box.height), -Infinity);
  const nearestBelow = others
    .filter((box) => box.top >= rawBottom)
    .reduce((closest, box) => Math.min(closest, box.top), Infinity);
  // Enough for four or five ledger lines and the slur above them. It used to
  // be 0.7, which was all the space there was between systems; the engraving
  // now leaves room, so the band can ask for what the music needs.
  const wanted = (rawBottom - rawTop) * 1.6;
  const top = Math.max(
    0,
    rawTop -
      (Number.isFinite(nearestAbove) ? Math.min(wanted, (rawTop - nearestAbove) / 2) : wanted),
  );
  const bottom =
    rawBottom +
    (Number.isFinite(nearestBelow) ? Math.min(wanted, (nearestBelow - rawBottom) / 2) : wanted);

  // Clip horizontally to the music, not the page. An engraved page carries
  // margins the scan crop above does not, so without this the reading sits
  // narrower than the scan it is being compared against and the bars do not
  // line up with the image. Scaling that band to the pane puts both on the
  // same horizontal axis.
  const left = Math.min(...boxes.map((box) => box.left));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bandWidth = Math.max(1, right - left);
  // Fill the pane, or fit the box a counterpart pane says to sit in.
  const targetWidth = place && place.width > 0 ? place.width : usableWidth;
  const scale = targetWidth > 0 ? targetWidth / bandWidth : 1;
  const offsetX = place ? place.left : 0;
  const geometry: PaneGeometry = { left, top, scale, offsetX };
  const playing = Boolean(transport?.isPlaying) && !transport?.isPaused;

  /**
   * Undo everything the pane did to the drawing, to reach score coordinates.
   *
   * The pane shows a clipped, scaled window onto one long endless-layout
   * page, so a click has to be walked back through the pane scale, the clip
   * offset, the render scale, and finally the page stacking that
   * `measureBounds` folded into `top`.
   */
  const toScorePoint = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!rendered) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const renderX = (event.clientX - rect.left - geometry.offsetX) / geometry.scale + geometry.left;
    const renderY = (event.clientY - rect.top) / geometry.scale + geometry.top;
    const page = rendered.pageHeight > 0 ? Math.floor(renderY / rendered.pageHeight) : 0;
    const pageY = renderY - page * rendered.pageHeight;
    const clickedPartIndex =
      partIndex ??
      rendered.staffBands.find(
        (band) => band.page === page && renderY >= band.top && renderY <= band.top + band.height,
      )?.partIndex;
    const measureIndex = measureIndexes.find((index) => {
      const box = localize(rendered.measures[index]);
      return (
        box &&
        renderX >= box.left &&
        renderX <= box.left + box.width &&
        renderY >= box.top &&
        renderY <= box.top + box.height
      );
    });
    return {
      page,
      x: renderX / rendered.renderScale,
      y: pageY / rendered.renderScale,
      measureIndex,
      partIndex: clickedPartIndex,
    };
  };

  return (
    <div
      ref={attachPane}
      /*
       * `overflow-clip`, not `overflow-hidden`.
       *
       * The drawing inside is a whole page scaled up so that one system's
       * band fills this box, so most of it is outside — that is the point.
       * But `hidden` makes this a scroll container, and the browser counts
       * the transformed content it clips toward the scrollable area of the
       * editor canvas above: a horizontal scrollbar appeared across the
       * whole editor, dragged to 1441px, and revealed nothing, because
       * there was nothing there. `clip` clips without becoming scrollable
       * and without contributing, which is what was meant both times.
       */
      className={`relative w-full overflow-clip rounded border bg-white ${
        tone === 'merged' ? 'border-cyan-300 ring-1 ring-cyan-200' : 'border-gray-200'
      } ${onPointMutate && noteInput ? 'cursor-crosshair' : ''}`}
      style={{ height: Math.max(1, (bottom - top) * scale) }}
      onClick={
        onPointMutate
          ? (event) => {
              const point = toScorePoint(event);
              if (point) onPointMutate(point);
            }
          : undefined
      }
      data-testid={tone === 'merged' ? 'merged-system-pane' : undefined}
    >
      {/* What this pane was asked to draw, and where, so a test can read it. */}
      <span
        className="hidden"
        data-testid="pane-measures"
        data-place-left={place ? Math.round(place.left) : ''}
        data-place-width={place ? Math.round(place.width) : ''}
      >
        {measureIndexes.join(',')}
      </span>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: rendered.width,
          transform: `translate(${offsetX}px, 0) scale(${scale}) translate(${-left}px, ${-top}px)`,
        }}
        // The SVG comes from the engine build, not from user input.
        dangerouslySetInnerHTML={{ __html: rendered.svg }}
      />
      {/*
                What a hovered control would take, or land on.

                Over the music, not under it: the engraving is an opaque SVG, so
                underneath is invisible. A whole bar of wash would sit on top of
                exactly what a reviewer is reading to decide, so the fill is
                faint and the edge does the work.
            */}
      {(preview || []).length > 0 && (
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{
            width: rendered.width,
            transform: `translate(${offsetX}px, 0) scale(${scale}) translate(${-left}px, ${-top}px)`,
          }}
        >
          {(preview || []).map((box, index) => (
            <div
              key={`preview-${box.left}-${index}`}
              data-testid="take-preview"
              className="absolute rounded bg-amber-300/15 ring-2 ring-amber-500/70"
              style={{
                left: box.left,
                top: box.top - 4,
                width: box.width,
                height: box.height + 8,
              }}
            />
          ))}
        </div>
      )}
      {/*
                Painted in the same transformed frame as the music, so a box
                stays on its note under any pane width. Behind nothing: it is a
                wash rather than an outline because an outline at this scale
                reads as a notation mark of its own.
            */}
      {(highlights || []).length > 0 && (
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{
            width: rendered.width,
            transform: `translate(${offsetX}px, 0) scale(${scale}) translate(${-left}px, ${-top}px)`,
          }}
        >
          {(highlights || []).map((box, index) => (
            <div
              key={`${box.left}-${box.top}-${index}`}
              data-testid="symbol-highlight"
              className="absolute rounded-sm bg-amber-300/40 ring-1 ring-amber-500/70"
              style={{
                left: box.left - 2,
                top: box.top - 2,
                width: Math.max(6, box.width) + 4,
                height: box.height + 4,
              }}
            />
          ))}
        </div>
      )}
      {onTogglePlay && (
        /*
                    Playback is read-only, so it costs the engine panes nothing
                    — and a wrong pitch or a dropped beat announces itself in a
                    second of audio, which is often faster than reading for it.

                    Left, with the label and the clef, rather than off in the
                    right margin: the controls belong to the reading they play,
                    and the eye is already at that end of the row.
                */
        <div className="absolute left-1 top-1 flex gap-1">
          <button
            type="button"
            onClick={(event) => {
              // The merged pane turns a click into an edit; playing
              // it must not also place a note.
              event.stopPropagation();
              onTogglePlay();
            }}
            disabled={transport?.isBusy}
            aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}
            className="rounded border border-gray-400 bg-white px-1.5 py-0.5 text-[11px] leading-none text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {transport?.isBusy ? '…' : playing ? '❚❚' : '▶'}
          </button>
          {/*
                        Stop is not pause: it gives the row back its silence and
                        puts the next play at the top of the passage. Only shown
                        once there is something to stop, so a row at rest carries
                        one control rather than two.
                    */}
          {onStop && (transport?.isPlaying || transport?.isPaused) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onStop();
              }}
              aria-label={`Stop ${label}`}
              className="rounded border border-gray-400 bg-white px-1.5 py-0.5 text-[11px] leading-none text-gray-800 shadow-sm hover:bg-gray-50"
            >
              ■
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Which reading the merged score currently takes a block's notes from.
 *
 * It starts as a copy of one engine's reading, so every block reads from that
 * engine until a decision moves it. A marking take does not move it: taking
 * dynamics leaves the notes where they were, and the record says so.
 */
export function mergedReadsBlockFrom(
  blockIndex: number,
  sourceEngineId: string,
  decisions: MergedScoreState['decisions'],
): string {
  let current = sourceEngineId;
  for (const decision of decisions || []) {
    if (decision.blockIndex !== blockIndex || decision.markingsOnly) continue;
    if (decision.engineId) current = decision.engineId;
  }
  return current;
}

export function mergedBlockFlagged(
  blockIndex: number,
  decisions: MergedScoreState['decisions'],
): boolean {
  let flagged = false;
  for (const decision of decisions || []) {
    if (decision.blockIndex === blockIndex && decision.flagged !== undefined) {
      flagged = decision.flagged;
    }
  }
  return flagged;
}

function blockHasExplicitReview(
  blockIndex: number,
  decisions: MergedScoreState['decisions'],
): boolean {
  return (
    (decisions || []).some(
      (decision) =>
        decision.blockIndex === blockIndex &&
        (Boolean(decision.engineId) || Boolean(decision.markingsOnly)),
    ) || mergedBlockFlagged(blockIndex, decisions)
  );
}

export type MergedBarState = 'inherited' | 'taken' | 'markings-merged' | 'edited' | 'flagged';

export function mergedBarStatesForRegion(
  region: ScannerRowRegion,
  mergeSource: 'left' | 'right',
  state: MergedScoreState | null | undefined,
): Array<{ measureIndex: number; state: MergedBarState }> {
  const decisions = (state?.decisions || []).filter(
    (decision) => decision.blockIndex === region.blockIndex,
  );
  const contentDecision = [...decisions]
    .reverse()
    .find((decision) => Boolean(decision.engineId) || Boolean(decision.markingsOnly));
  const flagged = mergedBlockFlagged(region.blockIndex, decisions);
  const sourceIndexes =
    mergeSource === 'left' ? region.leftMeasureIndexes : region.rightMeasureIndexes;
  const map =
    (region.stablePartKey ? state?.measureMaps?.[region.stablePartKey] : undefined) ||
    state?.measureMap;
  const mapped = map
    ? sourceIndexes.flatMap((sourceIndex) =>
        map.flatMap((mappedSource, measureIndex) =>
          mappedSource === sourceIndex ? [measureIndex] : [],
        ),
      )
    : sourceIndexes;
  const measureIndexes = contentDecision?.measureIndexes?.length
    ? contentDecision.measureIndexes
    : mapped;
  const edited = new Set(
    (state?.editedMeasures || [])
      .filter(
        (entry) =>
          !entry.stablePartKey ||
          !region.stablePartKey ||
          entry.stablePartKey === region.stablePartKey,
      )
      .map((entry) => entry.measureIndex),
  );
  return [...new Set(measureIndexes)].map((measureIndex) => ({
    measureIndex,
    state: flagged
      ? 'flagged'
      : edited.has(measureIndex)
        ? 'edited'
        : contentDecision?.markingsOnly
          ? 'markings-merged'
          : contentDecision?.engineId
            ? 'taken'
            : 'inherited',
  }));
}

/**
 * The decision surface: one control per difference in this row, on the side it
 * would come from.
 *
 * The arrow points at the merged score, because that is where the bar goes —
 * "take from above" reading downward is the whole reason the merged pane sits
 * in the middle rather than beside the two readings.
 *
 * A difference whose place on the scan could not be proven arrives with no
 * signature, and there is no control for it at all. That is the scanner's rule
 * made visible: a decision without evidence is not offered, rather than offered
 * and refused (design §7).
 */
function Gutter({
  direction,
  layout = 'vertical',
  label,
  regions,
  engineId,
  readsFrom,
  onPreview,
  onTake,
  outcome,
  busy,
}: {
  direction: 'down' | 'up';
  layout?: ScannerRowLayout;
  label: string;
  regions: ScannerRowRegion[];
  engineId?: string;
  /** Which engine the merged score currently reads a block's notes from. */
  readsFrom: (blockIndex: number) => string;
  /**
   * What the control under the pointer would change.
   *
   * Hovering is how a reviewer asks "which bars is this one?" without
   * pressing it. The answer remains visible after the pointer leaves so the
   * reviewer can inspect it; hovering or focusing another Take replaces it.
   */
  onPreview: (region: ScannerRowRegion) => void;
  /**
   * What the last take from this side did, if it was from this side.
   *
   * Reported here rather than only at the top of the view: the editor is
   * thousands of pixels tall now, and a refusal announced above the fold from
   * a button below it reads as a button that does nothing.
   */
  outcome: { blockIndex: number; engineId: string; message: string } | null;
  onTake: (region: ScannerRowRegion, engineId: string, kind?: 'dynamics' | 'lyrics') => void;
  busy: boolean;
}) {
  if (regions.length === 0 || !engineId) return null;
  return (
    <div
      className={`flex gap-1 py-0.5 text-[11px] text-gray-700 ${
        layout === 'horizontal'
          ? 'w-40 shrink-0 flex-col items-stretch justify-center'
          : 'flex-wrap items-center'
      }`}
    >
      <span
        className={`${layout === 'horizontal' ? 'text-center' : 'mr-1'} uppercase tracking-wide text-gray-500`}
      >
        take from {label}
      </span>
      {regions.map((region) => {
        /*
                    Offered only when pressing it would change something.

                    Two ways it would not. A block whose place on the scan could
                    not be proven cannot be decided at all (§7), and used to be
                    drawn disabled — offered and then refused, which is what §7
                    says not to do. And a block the merged score already reads
                    from this engine has nothing to take: the server refuses it
                    with "the merged score already reads this passage the way
                    that engine does", and a control whose only outcome is that
                    message is worse than no control, because a reviewer cannot
                    tell it from one that is merely unavailable.
                */
        if (!region.contentSignature) return null;
        /*
                    Both sides are always here, and the one the merged score
                    already reads says so rather than vanishing.
                    
                    Removing it made the pair asymmetric: after taking a bar
                    from one reading there was no control to take it back, so a
                    decision could not be undone from where it was made. Left in
                    and disabled, it is also the only thing on screen that says
                    which reading the merged bar currently follows.
                */
        const alreadyRead = readsFrom(region.blockIndex) === engineId;
        const decidable = !alreadyRead;
        const from = direction === 'down' ? region.leftMarkings : region.rightMarkings;
        const bars = (direction === 'down' ? region.leftMeasureIndexes : region.rightMeasureIndexes)
          .length;
        const arrow =
          layout === 'horizontal'
            ? direction === 'down'
              ? '→'
              : '←'
            : direction === 'down'
              ? '↓'
              : '↑';
        return (
          <span
            key={region.blockIndex}
            className={`flex gap-0.5 ${
              layout === 'horizontal'
                ? 'flex-wrap items-center justify-center rounded border border-gray-200 bg-gray-50 p-1'
                : 'items-center'
            }`}
            onMouseEnter={() => onPreview(region)}
            onFocusCapture={() => onPreview(region)}
          >
            <button
              type="button"
              data-testid={`btn-take-${direction}-${region.blockIndex}`}
              disabled={!decidable || busy}
              title={
                decidable
                  ? `Take difference ${region.blockIndex + 1} from ${label}`
                  : `The merged score already reads difference ${
                      region.blockIndex + 1
                    } from ${label}. Take it from the other reading to change it.`
              }
              onClick={() => onTake(region, engineId)}
              className="rounded border border-cyan-600 bg-white px-1.5 py-0.5 font-semibold text-cyan-800 shadow-sm hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-600 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-50 disabled:font-normal disabled:text-gray-400 disabled:shadow-none"
            >
              {arrow} {region.blockIndex + 1}
              {bars === 0 ? ' (remove)' : bars > 1 ? ` (${bars} bars)` : ''}
            </button>
            {/*
                            Only when this side has any. Dynamics and lyrics are
                            separate judgements — a reviewer may trust one
                            engine's dynamics and the other's words — and an
                            engine that read neither offers neither.
                        */}
            {from?.dynamics && (
              <button
                type="button"
                data-testid={`btn-take-${direction}-dynamics-${region.blockIndex}`}
                disabled={busy}
                title={`Take only the dynamics of difference ${region.blockIndex + 1} from ${label}, leaving the notes`}
                onClick={() => onTake(region, engineId, 'dynamics')}
                className="rounded border border-cyan-300 bg-white px-1 py-0.5 text-cyan-800 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-600 disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {arrow} dynamics
              </button>
            )}
            {from?.lyrics && (
              <button
                type="button"
                data-testid={`btn-take-${direction}-lyrics-${region.blockIndex}`}
                disabled={busy}
                title={`Take only the lyrics of difference ${region.blockIndex + 1} from ${label}, leaving the notes`}
                onClick={() => onTake(region, engineId, 'lyrics')}
                className="rounded border border-cyan-300 bg-white px-1 py-0.5 text-cyan-800 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-600 disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {arrow} lyrics
              </button>
            )}
            {outcome &&
              outcome.blockIndex === region.blockIndex &&
              outcome.engineId === engineId && (
                <span
                  className="ml-1 inline-flex flex-wrap items-center gap-1 text-gray-700"
                  data-testid="take-outcome"
                  role="status"
                >
                  {outcome.message}
                </span>
              )}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The page, one scanned system at a time: the scan, then each engine's reading
 * of it, with the reviewer's merged score between them.
 *
 * The engine panes are evidence and stay read-only — an edited HOMR pane is no
 * longer a record of what HOMR produced, which destroys both the provenance the
 * signature model protects and the training signal phase E depends on. The
 * merged pane is where a correction goes (design §3.1).
 */
export function ScannerSystemRows({
  systems,
  regions,
  leftXml,
  rightXml,
  leftLabel,
  rightLabel,
  leftEngineId,
  rightEngineId,
  merged: mergedState,
  onlyBlockIndex,
  transport,
  onMergedScoreChange,
  resolveUrl,
}: {
  systems: ScannerSystem[];
  regions: ScannerRowRegion[];
  leftXml: string;
  rightXml: string;
  leftLabel: string;
  rightLabel: string;
  leftEngineId?: string;
  rightEngineId?: string;
  merged?: MergedScoreState | null;
  /**
   * Render only the systems one difference falls in.
   *
   * The reviewer clicked that difference; the agreeing lines below it answer
   * a question nobody asked.
   */
  onlyBlockIndex?: number;
  /**
   * Playback for all three panes, owned by the workspace so there is one
   * transport rather than a second competing one. Absent in tests that do not
   * exercise audio.
   */
  transport?: CompareTransport;
  /**
   * The merged score is owned here — this is where it is edited — but the
   * transport lives with the workspace, so it has to be reported upward.
   */
  onMergedScoreChange?: (score: Score | null) => void;
  resolveUrl: (relative: string) => string;
}) {
  const [left, setLeft] = useState<RenderedSide | null>(null);
  const [right, setRight] = useState<RenderedSide | null>(null);
  const [mergedRender, setMergedRender] = useState<RenderedSide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteInput, setNoteInput] = useState(false);
  const [palettesOpen, setPalettesOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  const [rowGranularity, setRowGranularity] = useState<'system' | 'staff'>('system');
  const [rowLayout, setRowLayout] = useState<ScannerRowLayout>('horizontal');
  const [collapsedPanes, setCollapsedPanes] = useState<Record<ScannerPane, boolean>>({
    scan: false,
    left: false,
    merged: false,
    right: false,
  });
  const togglePane = useCallback((pane: ScannerPane) => {
    setCollapsedPanes((current) => ({ ...current, [pane]: !current[pane] }));
  }, []);

  /**
   * Which engine the merged score starts from, wholesale.
   *
   * Not an empty document: a page where one engine is almost right would then
   * cost a decision per bar. Starting from a chosen engine makes "this is a
   * Transcoda page" the ordinary entry point rather than a special action, and
   * per-bar decisions override it from S3 onward.
   */
  const [mergeSource, setMergeSource] = useState<'left' | 'right'>(
    mergedState?.sourceEngineId && mergedState.sourceEngineId === rightEngineId ? 'right' : 'left',
  );

  const leftStarts = useMemo(
    () => systems.map((system) => system.leftMeasureIndexes[0]).filter((n) => n !== undefined),
    [systems],
  );
  const rightStarts = useMemo(
    () => systems.map((system) => system.rightMeasureIndexes[0]).filter((n) => n !== undefined),
    [systems],
  );

  const mergeStarts = mergeSource === 'left' ? leftStarts : rightStarts;
  const mergeSourceXml = mergeSource === 'left' ? leftXml : rightXml;
  const mergedLabel = mergeSource === 'left' ? leftLabel : rightLabel;
  const mergedEngineId = (mergeSource === 'left' ? leftEngineId : rightEngineId) || '';

  /**
   * Reflow whatever the merged document is onto the scan's systems.
   *
   * The persisted score is saved without imposed breaks, so it needs exactly
   * the same treatment an engine reading does — the rows are a way of reading
   * the page, not a property of any of the three documents.
   */
  const prepare = useCallback(
    (persistedXml: string | null, state: MergedScoreState | null) => {
      const source = persistedXml ?? mergeSourceXml;
      if (!source) return null;
      /*
       * Follow the line starts through the merge before imposing them.
       *
       * They are positions in the engine reading, and a take that inserts
       * or removes bars renumbers everything after it — so bar 8 of the
       * reading may be bar 9 of the merge. Breaking at the old number
       * puts a different bar at the head of the line, which is the line
       * reflowing under a reader who did not ask it to. Only the
       * persisted document needs this; before there is one, the merged
       * score *is* the reading.
       */
      const starts = lineStartsInMerge(
        mergeStarts as number[],
        persistedXml ? state?.measureMap : undefined,
      );
      return {
        xml: withSystemSpacing(withForcedSystemBreaks(source, starts)),
        baselineMeasures: measureCount(source),
      };
    },
    [mergeSourceXml, mergeStarts],
  );

  const merged = useMergedScoreDocument({
    state: mergedState ?? null,
    resolveUrl,
    prepare,
    sourceEngineId: mergedEngineId,
  });

  const chooseMergeSource = useCallback(
    async (side: 'left' | 'right') => {
      if (side === mergeSource) return;
      const engineId = side === 'left' ? leftEngineId : rightEngineId;
      if (!engineId || !leftEngineId || !rightEngineId) return;
      const outcome = await merged.chooseSource({
        engineId,
        baseEngineId: leftEngineId,
        candidateEngineId: rightEngineId,
      });
      if (!outcome.ok) {
        setNotice(outcome.error);
        return;
      }
      // The response has already made this engine the server-side source.
      // Changing the local side now triggers a reload of that persisted
      // revision with the matching scan-system breaks.
      setMergeSource(side);
      setNotice(`Started the merged score from ${side === 'left' ? leftLabel : rightLabel}.`);
    },
    [leftEngineId, leftLabel, mergeSource, merged, rightEngineId, rightLabel],
  );

  const {
    load: loadMerged,
    mutate: mutateMerged,
    score: mergedScore,
    revision: mergedRevision,
  } = merged;

  useEffect(() => {
    if (!leftXml || !rightXml || systems.length === 0) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const [renderedLeft, renderedRight] = await Promise.all([
          renderSide(leftXml, leftStarts as number[]),
          renderSide(rightXml, rightStarts as number[]),
        ]);
        if (cancelled) return;
        setLeft(renderedLeft);
        setRight(renderedRight);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leftXml, rightXml, systems.length, leftStarts, rightStarts]);

  // The merged document is loaded once per source choice; switching engines
  // wholesale is a reload, which is exactly what "starts from" means.
  useEffect(() => {
    if (!mergeSourceXml || systems.length === 0) return;
    void loadMerged();
  }, [loadMerged, mergeSourceXml, systems.length, mergeSource]);

  useEffect(() => {
    onMergedScoreChange?.(mergedScore);
  }, [mergedScore, onMergedScoreChange]);

  /*
   * Which merged bars hold something other than their time signature.
   *
   * MuseScore marks them with a small plus in the corner, which says that
   * something is wrong but not what. On one Klengel page eighteen of
   * fifty-one bars held something other than the 2/4 they were written in —
   * three beats being the commonest — and a reviewer had no way to find them
   * except by hunting for the mark. The engine knows both lengths, so it is
   * asked for them, after every edit because an edit can create or resolve
   * one.
   */
  const [irregular, setIrregular] = useState<IrregularMeasure[]>([]);
  useEffect(() => {
    if (!mergedScore?.irregularMeasures) {
      setIrregular([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const found = await mergedScore.irregularMeasures!();
        if (!cancelled) setIrregular(Array.isArray(found) ? found : []);
      } catch {
        // A build without the export loses the warning and nothing else.
        if (!cancelled) setIrregular([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mergedScore, mergedRevision]);

  const fixMeasureLength = useCallback(
    (measureIndex: number) => {
      void mutateMerged(`set bar ${measureIndex + 1} to its time signature`, async (target) => {
        await target.setMeasureLengthToTimeSignature?.(measureIndex);
      });
    },
    [mutateMerged],
  );

  /*
   * Every over-full bar at once, because they are never right.
   *
   * A page of them is common — eighteen of fifty-one on one Klengel page —
   * and fixing them one at a time is a chore with no judgement in it. The
   * under-full ones are excluded on purpose: a pickup is short by definition,
   * and padding it out would invent rests where the music does not start yet.
   * Those keep their own button, for a reviewer who has looked.
   */
  const overfull = useMemo(() => overfullMeasures(irregular), [irregular]);
  const fixAllOverfull = useCallback(() => {
    if (overfull.length === 0) return;
    void mutateMerged(
      `set ${overfull.length} over-full bars to their time signature`,
      async (target) => {
        // Descending, so an earlier fix cannot renumber a later target.
        for (const bar of [...overfull].sort((left, right) => right.index - left.index)) {
          await target.setMeasureLengthToTimeSignature?.(bar.index);
        }
      },
    );
  }, [mutateMerged, overfull]);

  // Re-render the merged rows after every edit.
  useEffect(() => {
    if (!mergedScore) {
      setMergedRender(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rendered = await renderScoreSide(mergedScore, {
          highlightSelection: true,
        });
        if (!cancelled) setMergedRender(rendered);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mergedScore, mergedRevision]);

  // The gutter is the only index: which differences fall in each system.
  const allRows = useMemo<
    Array<{
      system: ScannerSystem;
      systemPosition: number;
      key: string;
      staffRow?: NonNullable<ScannerSystem['staffRows']>[number];
    }>
  >(
    () =>
      systems.flatMap((system, systemPosition) => {
        if (rowGranularity === 'system' || !system.staffRows?.length) {
          return [{ system, systemPosition, key: `system-${system.systemIndex}` }];
        }
        return system.staffRows.map((staffRow) => ({
          system,
          systemPosition,
          staffRow,
          key: `system-${system.systemIndex}-part-${staffRow.stablePartKey}`,
        }));
      }),
    [rowGranularity, systems],
  );

  const differencesByRow = useMemo(() => {
    return allRows.map(({ system, staffRow }) => {
      const left = new Set(staffRow?.leftMeasureIndexes || system.leftMeasureIndexes);
      const right = new Set(staffRow?.rightMeasureIndexes || system.rightMeasureIndexes);
      return regions.filter(
        (region) =>
          (!staffRow || region.stablePartKey === staffRow.stablePartKey) &&
          (region.leftMeasureIndexes.some((index) => left.has(index)) ||
            region.rightMeasureIndexes.some((index) => right.has(index))),
      );
    });
  }, [allRows, regions]);

  /**
   * The differences a reader can actually be taken to, in page order.
   *
   * Ordered by the system they appear on rather than by block index, because
   * the reader is walking down a page, and a list that jumps back up it is
   * not a walk. Only differences that landed on a system are here: one whose
   * place on the scan could not be proven has no row to show.
   */
  const navigableLines = useMemo(() => {
    return differencesByRow.flatMap((entries, rowIndex) =>
      entries.length > 0 ? [{ blockIndex: entries[0].blockIndex, rowIndex }] : [],
    );
  }, [differencesByRow]);

  // The host names the difference to open; moving between them is this
  // view's own business, because everything a reader needs to move — the
  // rows, the scan, the readings — is already here.
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | undefined>(onlyBlockIndex);
  const [staleCrops, setStaleCrops] = useState<Set<number>>(new Set());
  // The difference the pointer is over, if any. Hover is a question — "which
  // bars is this one?" — and this is what answers it.
  const [previewRegion, setPreviewRegion] = useState<ScannerRowRegion | null>(null);
  // A take the reviewer may repeat deliberately, after being told why it
  // refused. Cleared as soon as anything else happens.
  const [takeOutcome, setTakeOutcome] = useState<{
    blockIndex: number;
    engineId: string;
    message: string;
  } | null>(null);
  useEffect(() => setSelectedBlockIndex(onlyBlockIndex), [onlyBlockIndex]);
  const selectedRowIndex = differencesByRow.findIndex((entries) =>
    entries.some((entry) => entry.blockIndex === selectedBlockIndex),
  );
  const selectedPosition = navigableLines.findIndex((entry) => entry.rowIndex === selectedRowIndex);
  const isFirstConflictLine = selectedPosition <= 0;
  const isLastConflictLine = selectedPosition < 0 || selectedPosition >= navigableLines.length - 1;
  const selectedRegion = regions.find((region) => region.blockIndex === selectedBlockIndex);
  const goToLine = (position: number) => {
    const target = navigableLines[position];
    if (!target) return;
    setSelectedBlockIndex(target.blockIndex);
  };

  useEffect(() => {
    if (selectedRowIndex < 0) return;
    const frame = window.requestAnimationFrame(() =>
      rowRefs.current[selectedRowIndex]?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'center',
      }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [selectedRowIndex]);

  /**
   * The systems this view actually shows.
   *
   * Scoped to one difference when the host asked for one — and if that
   * difference has no system at all, which happens when its place on the scan
   * could not be proven, the result is empty and says so rather than silently
   * showing the whole page instead.
   */
  const visibleRows = useMemo(() => {
    const indexed = allRows.map((row, rowIndex) => ({ ...row, rowIndex }));
    if (selectedBlockIndex === undefined) return indexed;
    return selectedRowIndex < 0
      ? []
      : indexed.filter(({ rowIndex }) => rowIndex === selectedRowIndex);
  }, [allRows, selectedBlockIndex, selectedRowIndex]);

  const differingRows = differencesByRow.reduce(
    (total, entries) => total + (entries.length > 0 ? 1 : 0),
    0,
  );

  useEffect(() => {
    const node = paneRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setPaneWidth(node.clientWidth));
    observer.observe(node);
    setPaneWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  /**
   * Playback for one pane of one row, over that row's measures only.
   *
   * A button on system 7 that started the reading from bar one would answer a
   * question nobody asked — the reviewer is deciding whether *this line*
   * sounds right.
   */
  const paneTransport = (side: CompareSide, measureIndexes: number[]) => {
    if (!transport || measureIndexes.length === 0) return {};
    const range = {
      startMeasureIndex: Math.min(...measureIndexes),
      endMeasureIndex: Math.max(...measureIndexes),
    };
    return {
      transport: transport.states[side],
      onTogglePlay: () => void transport.toggleSidePlayPause(side, range),
      onStop: () => void transport.stopSideAudio(side),
    };
  };

  const mergedIndexes = (
    system: ScannerSystem,
    staffRow?: NonNullable<ScannerSystem['staffRows']>[number],
  ) =>
    mergeSource === 'left'
      ? staffRow?.leftMeasureIndexes || system.leftMeasureIndexes
      : staffRow?.rightMeasureIndexes || system.rightMeasureIndexes;

  const mergedPartKeys = useMemo(() => {
    const result = new Map<number, string>();
    for (const system of systems) {
      for (const row of system.staffRows || []) {
        const ordinal = mergeSource === 'left' ? row.leftPartIndex : row.rightPartIndex;
        if (ordinal !== undefined) result.set(ordinal, row.stablePartKey);
      }
    }
    return result;
  }, [mergeSource, systems]);
  const activeEditPartKey = useRef<string | undefined>(undefined);

  /** A click in the merged pane either places a note or selects what is there. */
  const handleMergedPoint = useCallback(
    (point: { page: number; x: number; y: number; measureIndex?: number; partIndex?: number }) => {
      const stablePartKey =
        point.partIndex === undefined ? undefined : mergedPartKeys.get(point.partIndex);
      activeEditPartKey.current = stablePartKey;
      void mutateMerged(
        noteInput ? 'place a note' : 'select that bar',
        async (target) => {
          if (noteInput && target.putNote) {
            await target.putNote(point.page, point.x, point.y, false, false);
            return;
          }
          if (target.selectElementAtPoint) {
            await target.selectElementAtPoint(point.page, point.x, point.y);
          } else if (target.selectMeasureAtPoint) {
            await target.selectMeasureAtPoint(point.page, point.x, point.y);
          }
          setHasSelection(true);
        },
        // Selecting changes nothing about the document, so it must not
        // mark the merge edited — an untouched merge saved after a stray
        // click would otherwise be filed as hand-corrected.
        {
          mutates: noteInput,
          skipRelayout: !noteInput,
          stablePartKey,
          measureIndexes: point.measureIndex === undefined ? undefined : [point.measureIndex],
        },
      );
    },
    [mergedPartKeys, mutateMerged, noteInput],
  );

  const toggleNoteInput = useCallback(() => {
    const next = !noteInput;
    void mutateMerged(
      next ? 'start note input' : 'stop note input',
      async (target) => {
        /*
         * The selection is where note input starts.
         *
         * `setInputStateFromSelection` is what puts the engine's input
         * position on the selected note, and it is why the editor's
         * cursor appears where you were looking rather than at the top
         * of the score. Entering note-entry mode without it leaves the
         * input state wherever it was, so the cursor is somewhere else
         * or nowhere at all. The editor calls it first for the same
         * reason; this did not call it.
         */
        if (next && target.setInputStateFromSelection) {
          await target.setInputStateFromSelection();
        }
        await target.setNoteEntryMode?.(next);
        setNoteInput(next);
      },
      { mutates: false, skipRelayout: true },
    );
  }, [mutateMerged, noteInput]);

  const applyMergedPaletteItem = useCallback(
    (item: ScorePaletteItem) => {
      const binding = scorePaletteMutation(item);
      if (!binding) {
        setNotice(`The ${item.label} palette item is not available in this editor.`);
        return;
      }
      void mutateMerged(
        `apply ${item.label}`,
        async (score) => {
          const method = (score as unknown as Record<string, unknown>)[binding.methodName];
          if (typeof method !== 'function') {
            throw new Error(`This build of webmscore does not expose "${binding.methodName}".`);
          }
          await Reflect.apply(method, score, binding.args);
        },
        { stablePartKey: activeEditPartKey.current },
      );
    },
    [mutateMerged],
  );

  // Keyboard editing, routed through the same policy the other comparators
  // use. Only the merged score is reachable from it.
  useEffect(() => {
    if (!mergedScore) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      routeCompareKeyboardShortcut(event, {
        active: true,
        activeRole: 'merged',
        hasSelection,
        noteMode: noteInput,
        mutate: (label, methodName, args, skipRelayout) => {
          void mutateMerged(
            label,
            async (score) => {
              const method = score[methodName];
              if (typeof method === 'function') {
                await Reflect.apply(method, score, args || []);
              }
            },
            { skipRelayout, stablePartKey: activeEditPartKey.current },
          );
        },
        updateInputState: (methodName, args) => {
          void mutateMerged(
            'change note input',
            async (score) => {
              const method = score[methodName];
              if (typeof method === 'function') {
                await Reflect.apply(method, score, args || []);
              }
            },
            { mutates: false, skipRelayout: true },
          );
        },
        copySelection: () => undefined,
        pasteSelection: () => undefined,
        disableNoteInput: () => {
          if (noteInput) toggleNoteInput();
        },
        toggleNoteInput,
        setHasSelection: (_role, selected) => setHasSelection(selected),
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasSelection, mergedScore, mutateMerged, noteInput, toggleNoteInput]);

  const takeBlock = useCallback(
    (region: ScannerRowRegion, engineId: string, kind?: 'dynamics' | 'lyrics') => {
      if (!region.contentSignature || !leftEngineId || !rightEngineId) return;
      void merged
        .take({
          blockIndex: region.blockIndex,
          contentSignature: region.contentSignature,
          engineId,
          baseEngineId: leftEngineId,
          candidateEngineId: rightEngineId,
          kind,
        })
        .then((outcome) => {
          if (!outcome.ok) {
            setTakeOutcome({
              blockIndex: region.blockIndex,
              engineId,
              message: outcome.error,
            });
            return;
          }
          const repaired = outcome.repairs.length
            ? ` ${outcome.repairs.map((repair) => repair.detail).join(' ')}`
            : '';
          setTakeOutcome({
            blockIndex: region.blockIndex,
            engineId,
            message: `Taken.${repaired}`,
          });
          /*
           * No reload here.
           *
           * `take` has already loaded the document it produced. This
           * used to call `loadMerged()`, which closes over the state
           * as it was before the take — and the merged score's URL is
           * pinned to the revision the caller holds, so it fetched the
           * revision that had just been superseded and drew the bar
           * the reviewer had replaced. Every take looked like it did
           * nothing.
           */
        });
    },
    [leftEngineId, rightEngineId, merged],
  );

  const flagBlock = useCallback(
    (region: ScannerRowRegion) => {
      if (!region.contentSignature || !leftEngineId || !rightEngineId) return;
      const flagged = !mergedBlockFlagged(region.blockIndex, merged.state?.decisions);
      void merged
        .flag({
          blockIndex: region.blockIndex,
          contentSignature: region.contentSignature,
          baseEngineId: leftEngineId,
          candidateEngineId: rightEngineId,
          flagged,
        })
        .then((outcome) =>
          setNotice(
            outcome.ok
              ? flagged
                ? `Conflict ${region.blockIndex + 1} skipped.`
                : `Conflict ${region.blockIndex + 1} reopened.`
              : outcome.error,
          ),
        );
    },
    [leftEngineId, merged, rightEngineId],
  );

  const takeScope = useCallback(
    (engineId: string, stablePartKey?: string) => {
      if (!leftEngineId || !rightEngineId) return;
      const pending = regions.filter(
        (region) =>
          region.contentSignature &&
          (!stablePartKey || region.stablePartKey === stablePartKey) &&
          !blockHasExplicitReview(region.blockIndex, merged.state?.decisions) &&
          mergedReadsBlockFrom(region.blockIndex, mergedEngineId, merged.state?.decisions) !==
            engineId,
      );
      void merged
        .takeMany(
          pending.map((region) => ({
            blockIndex: region.blockIndex,
            contentSignature: region.contentSignature!,
            engineId,
            baseEngineId: leftEngineId,
            candidateEngineId: rightEngineId,
          })),
        )
        .then((outcome) =>
          setNotice(
            outcome.ok
              ? pending.length === 0
                ? 'Every undecided difference in that scope already follows this reading.'
                : `Took ${pending.length} undecided difference${pending.length === 1 ? '' : 's'} from ${engineId}. Explicit decisions were preserved.`
              : outcome.error,
          ),
        );
    },
    [leftEngineId, merged, mergedEngineId, regions, rightEngineId],
  );

  /**
   * Save against readings that have moved, because the reviewer says so.
   *
   * The only save anyone still asks for by hand: ordinary changes are kept
   * without being asked, but which readings a stale merge answers is a
   * judgement, not clerical work.
   */
  const saveAgainstNewReadings = useCallback(async () => {
    const outcome = await merged.save({ acceptStale: true });
    setNotice(
      outcome.ok
        ? 'Saved against the new readings. This merged score is what page assembly uses.'
        : outcome.error,
    );
  }, [merged]);

  const readsFrom = useCallback(
    (blockIndex: number) =>
      mergedReadsBlockFrom(blockIndex, mergedEngineId, merged.state?.decisions),
    [mergedEngineId, merged.state?.decisions],
  );

  /**
   * The scan of one system, with the difference under review boxed on it.
   *
   * Rendered twice per row — above the first reading and below the second —
   * so each reading has the page it was read from next to it.
   */
  const scanCrop = (
    system: ScannerSystem,
    rowIndex: number,
    position: 'above' | 'below' = 'above',
    staffRow?: NonNullable<ScannerSystem['staffRows']>[number],
    highlightRegion?: ScannerRowRegion | null,
  ) => {
    if (!system.cropUrl) return null;
    if (staleCrops.has(system.systemIndex)) {
      return (
        /*
                    A crop is signature-bound and the server refuses it once the
                    job moves on. An `<img>` cannot read that refusal, so it has
                    to be said here — a broken image would look like a bug in the
                    page rather than a scan that has been superseded.
                */
        <p
          role="alert"
          className={`rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 ${
            position === 'above' ? 'mb-2' : 'mt-2'
          }`}
        >
          This scan crop is no longer current. Reload the page to compare against the readings as
          they stand now.
        </p>
      );
    }
    const systemRegion = system.region;
    // The endpoint pads the semantic system bounds before extracting the
    // bitmap. Size and position everything against that exact rectangle;
    // using `region` here clips the padding and moves every overlay.
    const cropRegion = system.cropRegion || systemRegion;
    const window =
      staffRow && cropRegion
        ? {
            left: (staffRow.region[0] - cropRegion[0]) / Math.max(1, cropRegion[2] - cropRegion[0]),
            top: (staffRow.region[1] - cropRegion[1]) / Math.max(1, cropRegion[3] - cropRegion[1]),
            width:
              (staffRow.region[2] - staffRow.region[0]) /
              Math.max(1, cropRegion[2] - cropRegion[0]),
            height:
              (staffRow.region[3] - staffRow.region[1]) /
              Math.max(1, cropRegion[3] - cropRegion[1]),
          }
        : { left: 0, top: 0, width: 1, height: 1 };
    const cropWidth = cropRegion ? Math.max(1, cropRegion[2] - cropRegion[0]) : 1400;
    const cropHeight = cropRegion ? Math.max(1, cropRegion[3] - cropRegion[1]) : 400;
    const systemAspect = cropRegion ? cropWidth / cropHeight : undefined;
    return (
      <div
        className={`relative overflow-hidden rounded border border-gray-200 bg-white ${
          position === 'above' ? 'mb-2' : 'mt-2'
        }`}
        style={
          systemAspect
            ? {
                aspectRatio: `${(systemAspect * window.width) / window.height}`,
                // A narrow two-bar line should remain a narrow
                // two-bar line. Enlarging a scan beyond its source
                // pixels adds blur and makes it look falsely zoomed.
                width: `min(100%, ${Math.max(1, cropWidth * window.width)}px)`,
                marginInline: 'auto',
              }
            : undefined
        }
      >
        <Image
          src={resolveUrl(system.cropUrl)}
          alt={`Scan of system ${rowIndex + 1}${position === 'below' ? ', repeated' : ''}`}
          width={cropWidth}
          height={cropHeight}
          unoptimized
          onError={() => setStaleCrops((current) => new Set(current).add(system.systemIndex))}
          className={
            systemAspect ? 'absolute max-w-none object-contain' : 'relative w-full object-contain'
          }
          style={
            systemAspect
              ? {
                  width: `${100 / window.width}%`,
                  left: `${(-window.left / window.width) * 100}%`,
                  top: `${(-window.top / window.height) * 100}%`,
                }
              : undefined
          }
        />
        {/*
                    The bars in question, boxed on the scan they came from.
                    Fractions of this crop, so the box holds wherever the image
                    is scaled to — the scan's own pixel size never reaches here.
                */}
        {(highlightRegion?.cropBoxes || [])
          .filter((box) => box.systemIndex === system.systemIndex)
          .map((box, boxIndex) => (
            <div
              key={`${box.left}-${boxIndex}`}
              data-testid="scan-difference-box"
              data-block-index={highlightRegion?.blockIndex}
              className="pointer-events-none absolute rounded-sm border-2 border-amber-500 bg-amber-300/15"
              style={{
                left: `${((box.left - window.left) / window.width) * 100}%`,
                top: `${((box.top - window.top) / window.height) * 100}%`,
                width: `${(box.width / window.width) * 100}%`,
                height: `${(box.height / window.height) * 100}%`,
              }}
            />
          ))}
      </div>
    );
  };

  return (
    /*
            No scroll container of its own.

            The rows live in an iframe sized by the host, and a scrollable box
            inside a fixed-height frame gives a reader two scrollbars and the
            shorter of two viewports. Growing to fit instead lets the host size
            the frame to the content and the page scroll it, which is the only
            way this gets the window's full height.
        */
    <div ref={paneRef} className="flex flex-col gap-3 p-4">
      {(selectedBlockIndex === undefined || busy || merged.loading || error || merged.error) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
          {selectedBlockIndex === undefined && (
            <span>
              {`${systems.length} system${systems.length === 1 ? '' : 's'} from the scan${
                differingRows > 0 ? `, ${differingRows} with differences` : ', none differing'
              }`}
            </span>
          )}
          {(busy || merged.loading) && <span aria-live="polite">Laying out the readings…</span>}
          {(error || merged.error) && (
            <span className="text-red-700" role="alert">
              {error || merged.error}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-cyan-200 bg-cyan-50/50 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-700">Merged score starts from</span>
          {(['left', 'right'] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={mergeSource === side}
              onClick={() => void chooseMergeSource(side)}
              disabled={
                mergeSource === side ||
                Boolean(merged.state?.present) ||
                merged.dirty ||
                merged.saving ||
                merged.busy
              }
              className={`rounded border px-2 py-1 ${
                mergeSource === side
                  ? 'border-cyan-700 bg-cyan-600 font-semibold text-white shadow-sm'
                  : 'border-gray-400 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50'
              }`}
            >
              {side === 'left' ? leftLabel : rightLabel}
            </button>
          ))}
          <span className="text-gray-600">
            Neither engine is the score. Only the merged pane can be edited; the engine panes are
            the evidence it is judged against.
          </span>
          {overfull.length > 0 && (
            <button
              type="button"
              data-testid="btn-fix-all-overfull"
              disabled={merged.busy}
              onClick={fixAllOverfull}
              title="Set every bar holding more than its time signature back to it, as Measure Properties would. Short bars are left alone: a pickup is short on purpose."
              className="rounded border border-amber-500 bg-white px-2 py-1 font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
            >
              correct {overfull.length} over-full bar
              {overfull.length === 1 ? '' : 's'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-700">Rows</span>
          {(['system', 'staff'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={rowGranularity === mode}
              disabled={mode === 'staff' && !systems.some((system) => system.staffRows?.length)}
              onClick={() => setRowGranularity(mode)}
              data-testid={`btn-rows-${mode}`}
              className={`rounded border px-2 py-1 disabled:opacity-50 ${
                rowGranularity === mode
                  ? 'border-cyan-700 bg-cyan-600 font-semibold text-white'
                  : 'border-gray-400 bg-white text-gray-800 hover:bg-gray-50'
              }`}
            >
              by {mode}
            </button>
          ))}
          {leftEngineId && (
            <button
              type="button"
              disabled={merged.saving || merged.busy}
              onClick={() => takeScope(leftEngineId)}
              data-testid="btn-take-page-left"
              className="rounded border border-cyan-500 bg-white px-2 py-1 font-medium text-cyan-900 disabled:opacity-50"
            >
              take undecided page from {leftLabel}
            </button>
          )}
          {rightEngineId && (
            <button
              type="button"
              disabled={merged.saving || merged.busy}
              onClick={() => takeScope(rightEngineId)}
              data-testid="btn-take-page-right"
              className="rounded border border-cyan-500 bg-white px-2 py-1 font-medium text-cyan-900 disabled:opacity-50"
            >
              take undecided page from {rightLabel}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-700">View</span>
          {(['horizontal', 'vertical'] as const).map((layout) => (
            <button
              key={layout}
              type="button"
              aria-pressed={rowLayout === layout}
              onClick={() => setRowLayout(layout)}
              data-testid={`btn-layout-${layout}`}
              className={`rounded border px-2 py-1 ${
                rowLayout === layout
                  ? 'border-cyan-700 bg-cyan-600 font-semibold text-white'
                  : 'border-gray-400 bg-white text-gray-800 hover:bg-gray-50'
              }`}
            >
              {layout === 'horizontal' ? 'Across' : 'Stacked'}
            </button>
          ))}
          <span className="ml-1 font-medium text-gray-700">Panes</span>
          {(
            [
              ['scan', 'Scan'],
              ['left', leftLabel],
              ['merged', 'Merged'],
              ['right', rightLabel],
            ] as const
          ).map(([pane, label]) => (
            <button
              key={pane}
              type="button"
              aria-pressed={!collapsedPanes[pane]}
              aria-label={`${collapsedPanes[pane] ? 'Show' : 'Hide'} ${label} pane`}
              onClick={() => togglePane(pane)}
              data-testid={`btn-toggle-pane-${pane}`}
              className={`rounded border px-2 py-1 ${
                collapsedPanes[pane]
                  ? 'border-gray-300 bg-gray-100 text-gray-500'
                  : 'border-cyan-500 bg-white text-cyan-900'
              }`}
            >
              {collapsedPanes[pane] ? `Show ${label}` : `Hide ${label}`}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
                        Says what has happened to the document, and asks for
                        nothing. There is no save button because there is
                        nothing a reviewer would do here that should not be
                        kept — see the autosave in `useMergedScoreDocument`.
                    */}
          <span className="text-gray-600" data-testid="merged-status">
            {merged.saving
              ? 'Saving…'
              : merged.dirty
                ? 'Saving shortly…'
                : merged.state?.present
                  ? `Saved, revision ${merged.state.revision}${merged.state.edited ? ', hand-corrected' : ''}`
                  : 'No changes yet'}
          </span>
        </div>

        {merged.state?.stale && (
          <div
            className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-amber-900"
            role="alert"
          >
            An engine has re-read this page since this merge was saved. Nothing has been thrown
            away, but the merge answers readings that no longer exist and is not being used for
            assembly. Review it, then{' '}
            <button
              type="button"
              onClick={() => void saveAgainstNewReadings()}
              className="underline"
              data-testid="btn-merged-accept-stale"
            >
              save it against the new readings
            </button>
            , or discard it.
          </div>
        )}

        {notice && <div className="text-gray-700">{notice}</div>}
      </div>

      {onlyBlockIndex !== undefined && visibleRows.length === 0 && (
        <p className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500">
          This difference has no verified place on the scan, so there is no line to show it on.
        </p>
      )}

      {visibleRows.map(({ system, systemPosition, staffRow, key, rowIndex }) => {
        const differences = differencesByRow[rowIndex];
        const leftRowIndexes = staffRow?.leftMeasureIndexes || system.leftMeasureIndexes;
        const rightRowIndexes = staffRow?.rightMeasureIndexes || system.rightMeasureIndexes;
        // A Take hover/focus establishes the one conflict being
        // inspected. It stays active until another Take replaces it,
        // but only appears on the row that owns it.
        const activeRegion =
          previewRegion &&
          differences.some((region) => region.blockIndex === previewRegion.blockIndex)
            ? previewRegion
            : null;
        const differenceDescriptions = activeRegion
          ? scannerRegionDifferenceDescriptions(activeRegion, leftLabel, rightLabel).map(
              (description) => ({
                blockIndex: activeRegion.blockIndex,
                description,
              }),
            )
          : [];
        /*
                    Below the readings, never above them.

                    Hovering a Take control is what fills this in, and it used
                    to sit above the row: its height varies with the number of
                    conflicts on the line and with how the prose wraps, and it
                    was absent entirely until the first hover. So every hover
                    resized a block above the controls and pushed them down --
                    far enough, in Across, that a neighbouring button slid under
                    a stationary cursor, fired its own preview, and moved the
                    row again. Rendered after the panes, its height changes
                    disturb nothing a pointer is aiming at.

                    Once, not once per reading: a single stable block below the
                    controls is close enough to both readings to be worth less
                    than the duplication cost.
                */
        const renderDifferenceDescription = () =>
          differenceDescriptions.length > 0 ? (
            <div
              className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-center text-sm font-bold text-amber-950"
              data-testid="difference-description"
              data-position="below-row"
            >
              {differenceDescriptions.map((entry, index) => (
                <div
                  key={`${entry.blockIndex}-${index}`}
                  className={index > 0 ? 'mt-1 border-t border-amber-200 pt-1' : ''}
                >
                  {differences.length > 1 && <span>Conflict {entry.blockIndex + 1}: </span>}
                  {entry.description}
                </div>
              ))}
            </div>
          ) : null;
        // Every unmatched event in the conflict under inspection. The
        // merged pane inherits the highlights of
        // whichever reading it was started from — it *is* that reading
        // until a decision changes it, so marking it differently would
        // be claiming a difference that has not happened yet.
        const symbols = activeRegion?.symbolDifferences || [];
        /*
                    What this row is about: the selected difference when there
                    is one, and otherwise everything differing on the line.

                    Deliberately not the hovered one. Every pane's geometry is
                    derived from this -- which bars it draws, and from those the
                    band it clips to and the scale it draws at, and from those
                    its height. Letting a pointer decide it meant that hovering
                    a Take control resized the panes: in Stacked, where panes
                    and gutters are a single flow, a pane that grew pushed every
                    control below it down and moved the button being hovered,
                    which fired the next hover. Selection is an act and may
                    resize; a pointer passing over is not and may not.

                    Nothing is lost by it. What a hovered control would take is
                    already washed onto the exact bars, in all three panes, by
                    the preview boxes below -- which is the question hovering
                    asks, answered without moving anything.
                */
        const focusRegions =
          selectedRegion && differences.some((r) => r.blockIndex === selectedRegion.blockIndex)
            ? [selectedRegion]
            : differences;
        /*
                    The engine panes narrow; the scan and the merged score do
                    not. The two readings are what is being compared, so their
                    width should go to the bars in question — but the scan is
                    the context the whole judgement rests on, and the merged
                    score is the thing being built, which a reviewer needs to
                    see as a line rather than as a fragment of one.
                */
        const focusIndexes = (side: 'left' | 'right') =>
          focusedMeasureIndexes(
            side === 'left' ? leftRowIndexes : rightRowIndexes,
            focusRegions.flatMap((region) =>
              side === 'left' ? region.leftMeasureIndexes : region.rightMeasureIndexes,
            ),
          );
        const leftFocus = focusIndexes('left');
        const rightFocus = focusIndexes('right');
        // What the merged pane can actually show of this line, and the
        // bars under review decide which part when it cannot show all.
        const mergedWindow = engravedRowWindow(
          mergedRender,
          mergedIndexes(system, staffRow),
          focusRegions.flatMap((region) =>
            mergeSource === 'left' ? region.leftMeasureIndexes : region.rightMeasureIndexes,
          ),
        );
        const rowPaneWidth = rowLayout === 'horizontal' ? HORIZONTAL_PANE_WIDTH : paneWidth;
        // Hovering a take shows both halves of what it would do: the
        // bars it would copy, in the reading they come from, and the
        // bars they would land on, in the merged score.
        const previewBoxes = (
          rendered: RenderedSide | null,
          measureIndexes: readonly number[],
        ): MeasureBox[] =>
          !activeRegion || !rendered
            ? []
            : measureIndexes
                .map((index) => rendered.measures[index])
                .filter((box): box is MeasureBox => Boolean(box));
        // Each engine pane sits over the merged bars it would replace,
        // at the merged score's own scale. The merged score's bars are
        // the ones its own reading contributed, so the indexes to line
        // up against are that side's.
        // Both engine panes get the same box: the span the merged score
        // devotes to the bars in question. Each still draws its own
        // bars — one reading may have three where the other has two —
        // and they occupy the same column, which is the comparison.
        const enginePlace = placeUnderMerged(
          mergedRender,
          // The bars the merged pane is drawing, not the ones the line
          // nominally holds: the engine panes sit over what is on
          // screen, and a window that dropped a bar moved everything.
          mergedWindow,
          mergeSource === 'left' ? leftFocus : rightFocus,
          rowPaneWidth,
        );
        const leftPlace = enginePlace;
        const rightPlace = enginePlace;
        const leftPreview = previewBoxes(left, activeRegion?.leftMeasureIndexes || []);
        const rightPreview = previewBoxes(right, activeRegion?.rightMeasureIndexes || []);
        const mergedPreview = previewBoxes(
          mergedRender,
          (mergeSource === 'left'
            ? activeRegion?.leftMeasureIndexes
            : activeRegion?.rightMeasureIndexes) || [],
        );
        const droppedFromLine = mergedIndexes(system, staffRow).length - mergedWindow.length;
        // Only the bars this row is showing; the rest belong to other rows.
        const onThisRow = new Set(mergedWindow);
        const rowIrregular = irregular.filter((bar) => onThisRow.has(bar.index));
        const highlightsFor = (
          rendered: RenderedSide | null,
          pick: (difference: ScannerSymbolDifference) => {
            measureIndex: number;
            indexes: number[];
            count: number;
          },
        ) =>
          symbols.flatMap((difference) => {
            const { measureIndex, indexes, count } = pick(difference);
            return eventBoxes(rendered, measureIndex, indexes, count);
          });
        const leftHighlights = highlightsFor(left, (difference) => ({
          measureIndex: difference.leftMeasureIndex,
          indexes: difference.leftEventIndexes,
          count: difference.leftEventCount,
        }));
        const rightHighlights = highlightsFor(right, (difference) => ({
          measureIndex: difference.rightMeasureIndex,
          indexes: difference.rightEventIndexes,
          count: difference.rightEventCount,
        }));
        const mergedHighlights = highlightsFor(mergedRender, (difference) =>
          mergeSource === 'left'
            ? {
                measureIndex: difference.leftMeasureIndex,
                indexes: difference.leftEventIndexes,
                count: difference.leftEventCount,
              }
            : {
                measureIndex: difference.rightMeasureIndex,
                indexes: difference.rightEventIndexes,
                count: difference.rightEventCount,
              },
        );
        const explicitBarStates = differences.flatMap((region) =>
          mergedBarStatesForRegion(region, mergeSource, merged.state)
            .filter((entry) => onThisRow.has(entry.measureIndex))
            .map((entry) => ({
              ...entry,
              blockIndex: region.blockIndex,
              stablePartKey: region.stablePartKey,
              partIndex: mergeSource === 'left' ? region.leftPartIndex : region.rightPartIndex,
            })),
        );
        const explicitlyShown = new Set(
          explicitBarStates.map((entry) => `${entry.stablePartKey || ''}:${entry.measureIndex}`),
        );
        const editedOnRow = merged.editedMeasures.filter(
          (entry) =>
            onThisRow.has(entry.measureIndex) &&
            (!staffRow || !entry.stablePartKey || entry.stablePartKey === staffRow.stablePartKey),
        );
        const barStateEntries = [
          ...explicitBarStates,
          ...editedOnRow
            .filter(
              (entry) => !explicitlyShown.has(`${entry.stablePartKey || ''}:${entry.measureIndex}`),
            )
            .map((entry) => ({
              ...entry,
              state: 'edited' as const,
              blockIndex: undefined,
              partIndex: undefined,
            })),
          ...mergedWindow
            .filter(
              (measureIndex) =>
                !explicitBarStates.some((entry) => entry.measureIndex === measureIndex) &&
                !editedOnRow.some((entry) => entry.measureIndex === measureIndex),
            )
            .map((measureIndex) => ({
              measureIndex,
              state: 'inherited' as const,
              blockIndex: undefined,
              stablePartKey: staffRow?.stablePartKey,
              partIndex:
                mergeSource === 'left' ? staffRow?.leftPartIndex : staffRow?.rightPartIndex,
            })),
        ];
        return (
          <div
            key={key}
            ref={(node) => {
              rowRefs.current[rowIndex] = node;
            }}
            /*
                            A row that contains a difference gets a marked edge,
                            not a wash. Tinting the whole card said "different"
                            about the five agreeing staves in it as loudly as
                            about the one bar that differs, and the gutter below
                            already names exactly which bar that is.
                        */
            className={`rounded-lg border p-3 ${
              differences.length > 0
                ? 'border-gray-200 border-l-4 border-l-amber-400'
                : 'border-gray-200'
            }`}
          >
            <div
              className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs"
              data-testid="system-row-header"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className="font-medium text-gray-700"
                  data-testid={selectedRowIndex === rowIndex ? 'difference-title' : undefined}
                >
                  {selectedRowIndex === rowIndex
                    ? `Conflict line ${selectedPosition + 1} of ${navigableLines.length}`
                    : `System ${systemPosition + 1}`}
                  {staffRow
                    ? ` · part ${((mergeSource === 'left' ? staffRow.leftPartIndex : staffRow.rightPartIndex) ?? 0) + 1}`
                    : ''}
                </span>
                {selectedRowIndex === rowIndex && navigableLines.length > 0 && (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isFirstConflictLine}
                      onClick={() => goToLine(selectedPosition - 1)}
                      data-testid="btn-previous-difference"
                      className="rounded border border-gray-400 bg-white px-2 py-0.5 text-gray-800 hover:bg-gray-50 disabled:border-gray-300 disabled:text-gray-400"
                    >
                      ← previous line
                    </button>
                    <button
                      type="button"
                      disabled={isLastConflictLine}
                      onClick={() => goToLine(selectedPosition + 1)}
                      data-testid="btn-next-difference"
                      className="rounded border border-gray-400 bg-white px-2 py-0.5 text-gray-800 hover:bg-gray-50 disabled:border-gray-300 disabled:text-gray-400"
                    >
                      next line →
                    </button>
                  </span>
                )}
              </span>
              {staffRow && differences.length > 0 && (
                <span className="flex flex-wrap items-center gap-1 text-gray-600">
                  {staffRow && differences.length > 0 && leftEngineId && (
                    <button
                      type="button"
                      disabled={merged.saving || merged.busy}
                      onClick={() => takeScope(leftEngineId, staffRow.stablePartKey)}
                      data-testid={`btn-take-part-left-${staffRow.stablePartKey}`}
                      className="rounded border border-cyan-400 bg-white px-1.5 py-0.5 text-cyan-900 disabled:opacity-50"
                    >
                      take undecided part from {leftLabel}
                    </button>
                  )}
                  {staffRow && differences.length > 0 && rightEngineId && (
                    <button
                      type="button"
                      disabled={merged.saving || merged.busy}
                      onClick={() => takeScope(rightEngineId, staffRow.stablePartKey)}
                      data-testid={`btn-take-part-right-${staffRow.stablePartKey}`}
                      className="rounded border border-cyan-400 bg-white px-1.5 py-0.5 text-cyan-900 disabled:opacity-50"
                    >
                      take undecided part from {rightLabel}
                    </button>
                  )}
                </span>
              )}
            </div>

            {barStateEntries.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px]">
                {barStateEntries.map((bar, index) => (
                  <span
                    key={`state-${bar.blockIndex ?? 'row'}-${bar.stablePartKey || ''}-${bar.measureIndex}-${index}`}
                    data-testid="merged-bar-state"
                    data-state={bar.state}
                    className={`rounded border px-1.5 py-0.5 ${
                      bar.state === 'flagged'
                        ? 'border-rose-400 bg-rose-50 text-rose-900'
                        : bar.state === 'edited'
                          ? 'border-violet-400 bg-violet-50 text-violet-900'
                          : bar.state === 'taken'
                            ? 'border-cyan-400 bg-cyan-50 text-cyan-900'
                            : bar.state === 'markings-merged'
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                              : 'border-gray-300 bg-gray-50 text-gray-600'
                    }`}
                  >
                    {bar.partIndex !== undefined ? `part ${bar.partIndex + 1}, ` : ''}
                    bar {bar.measureIndex + 1}: {bar.state === 'flagged' ? 'skipped' : bar.state}
                  </span>
                ))}
                {differences.map((region) => {
                  const flagged = mergedBlockFlagged(region.blockIndex, merged.state?.decisions);
                  return region.contentSignature ? (
                    <button
                      key={`flag-${region.blockIndex}`}
                      type="button"
                      onClick={() => flagBlock(region)}
                      disabled={merged.saving || merged.busy}
                      data-testid={`btn-flag-${region.blockIndex}`}
                      aria-pressed={flagged}
                      className="rounded border border-rose-400 bg-white px-1.5 py-0.5 text-rose-900 disabled:opacity-50"
                    >
                      {flagged ? 'Reopen conflict' : 'Skip conflict'}
                    </button>
                  ) : null;
                })}
              </div>
            )}

            {!collapsedPanes.scan &&
              scanCrop(system, systemPosition, 'above', staffRow, activeRegion)}

            {/*
                            Reading, merge, reading, with a gutter between each
                            pane and the merged score — so "take from above" and
                            "take from below" read the way a three-way merge
                            does, and the arrow points where the bar will go.
                        */}
            <div className={rowLayout === 'horizontal' ? 'overflow-x-auto pb-2' : ''}>
              <div
                className={
                  rowLayout === 'horizontal'
                    ? 'flex w-max min-w-full items-start gap-2'
                    : 'space-y-2'
                }
              >
                {!collapsedPanes.left && (
                  <div
                    className={rowLayout === 'horizontal' ? 'shrink-0' : undefined}
                    style={
                      rowLayout === 'horizontal' ? { width: HORIZONTAL_PANE_WIDTH } : undefined
                    }
                  >
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">
                      {leftLabel}
                    </div>
                    <SystemPane
                      rendered={left}
                      highlights={leftHighlights}
                      preview={leftPreview}
                      place={leftPlace}
                      measureIndexes={leftFocus}
                      label={leftLabel}
                      paneWidth={rowPaneWidth}
                      partIndex={staffRow?.leftPartIndex}
                      {...paneTransport('left', leftFocus)}
                    />
                  </div>
                )}
                {!collapsedPanes.left && !collapsedPanes.merged && (
                  <Gutter
                    readsFrom={readsFrom}
                    onPreview={setPreviewRegion}
                    outcome={takeOutcome}
                    direction="down"
                    layout={rowLayout}
                    label={leftLabel}
                    regions={differences}
                    engineId={leftEngineId}
                    onTake={takeBlock}
                    busy={merged.saving}
                  />
                )}
                {!collapsedPanes.merged && (
                  <div
                    className={rowLayout === 'horizontal' ? 'shrink-0' : undefined}
                    style={
                      rowLayout === 'horizontal' ? { width: HORIZONTAL_PANE_WIDTH } : undefined
                    }
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-cyan-800">
                      <span className="font-semibold">Merged</span>
                      <span
                        className="flex items-center gap-1 normal-case tracking-normal"
                        data-testid="merged-pane-controls"
                      >
                        <button
                          type="button"
                          onClick={toggleNoteInput}
                          aria-pressed={noteInput}
                          disabled={!mergedScore || merged.busy}
                          data-testid="btn-merged-note-input"
                          className={`rounded border px-2 py-0.5 disabled:opacity-50 ${
                            noteInput
                              ? 'border-cyan-700 bg-cyan-600 font-semibold text-white shadow-sm'
                              : 'border-gray-400 bg-white text-gray-800 hover:bg-gray-50'
                          }`}
                        >
                          {noteInput ? 'Note input on' : 'Note input'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPalettesOpen(true)}
                          disabled={!mergedScore || !hasSelection || merged.busy}
                          data-testid="btn-merged-palettes"
                          title={
                            hasSelection
                              ? 'Open score palettes'
                              : 'Select something in the merged score first'
                          }
                          className="rounded border border-gray-400 bg-white px-2 py-0.5 text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Palettes
                        </button>
                      </span>
                      {rowIrregular.length > 0 && (
                        /*
                                            Said on the row that holds the bar,
                                            not in a list somewhere else: the
                                            reviewer is looking at this line,
                                            and the fix is for one bar of it.
                                        */
                        <span className="flex flex-wrap items-center gap-1 normal-case tracking-normal">
                          {rowIrregular.map((bar) => (
                            <span
                              key={bar.index}
                              className="flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-amber-900"
                              data-testid="irregular-bar"
                            >
                              {scannerMeasureLabel(bar)} holds {bar.actual}, not {bar.nominal}
                              {!scannerMeasureIsPickup(bar) && (
                                <button
                                  type="button"
                                  data-testid={`btn-fix-bar-${bar.index}`}
                                  disabled={merged.busy}
                                  onClick={() => fixMeasureLength(bar.index)}
                                  title={`Set ${scannerMeasureLabel(bar)} to ${bar.nominal}, as Measure Properties would`}
                                  className="rounded border border-amber-500 bg-white px-1 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50"
                                >
                                  make it {bar.nominal}
                                </button>
                              )}
                            </span>
                          ))}
                        </span>
                      )}
                      {droppedFromLine > 0 && (
                        <span
                          className="normal-case tracking-normal text-gray-500"
                          data-testid="merged-line-trimmed"
                        >
                          not showing {droppedFromLine} bar
                          {droppedFromLine === 1 ? '' : 's'} that did not fit on one system
                        </span>
                      )}
                      <span className="normal-case tracking-normal text-gray-500">
                        {merged.dirty
                          ? `started from ${mergedLabel}, edited here`
                          : `every bar inherited from ${mergedLabel}`}
                      </span>
                    </div>
                    <SystemPane
                      rendered={mergedRender}
                      highlights={mergedHighlights}
                      preview={mergedPreview}
                      noteInput={noteInput}
                      measureIndexes={mergedWindow}
                      label="The merged score"
                      paneWidth={rowPaneWidth}
                      partIndex={
                        mergeSource === 'left' ? staffRow?.leftPartIndex : staffRow?.rightPartIndex
                      }
                      tone="merged"
                      onPointMutate={handleMergedPoint}
                      {...paneTransport('middle', mergedWindow)}
                    />
                  </div>
                )}
                {!collapsedPanes.merged && !collapsedPanes.right && (
                  <Gutter
                    readsFrom={readsFrom}
                    onPreview={setPreviewRegion}
                    outcome={takeOutcome}
                    direction="up"
                    layout={rowLayout}
                    label={rightLabel}
                    regions={differences}
                    engineId={rightEngineId}
                    onTake={takeBlock}
                    busy={merged.saving}
                  />
                )}
                {!collapsedPanes.right && (
                  <div
                    className={rowLayout === 'horizontal' ? 'shrink-0' : undefined}
                    style={
                      rowLayout === 'horizontal' ? { width: HORIZONTAL_PANE_WIDTH } : undefined
                    }
                  >
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">
                      {rightLabel}
                    </div>
                    <SystemPane
                      rendered={right}
                      highlights={rightHighlights}
                      preview={rightPreview}
                      place={rightPlace}
                      measureIndexes={rightFocus}
                      label={rightLabel}
                      paneWidth={rowPaneWidth}
                      partIndex={staffRow?.rightPartIndex}
                      {...paneTransport('right', rightFocus)}
                    />
                  </div>
                )}
              </div>
            </div>

            {renderDifferenceDescription()}

            {/*
                            The scan again, under the second reading.

                            One copy at the top of the row put the scan beside
                            the first reading and three panes away from the
                            second, so comparing the lower reading against the
                            page meant carrying a line of music in your head
                            past two other staves. It is the same image, and
                            images are cheap next to that.

                            Outside the row rather than the last item in it, so
                            the description above can sit between the readings
                            and their page.
                        */}
            {rowLayout === 'vertical' &&
              !collapsedPanes.scan &&
              scanCrop(system, systemPosition, 'below', staffRow, activeRegion)}
          </div>
        );
      })}
      {palettesOpen && (
        <FloatingPalettes
          disabled={!hasSelection || merged.busy}
          dragEnabled={false}
          onApply={applyMergedPaletteItem}
          onClose={() => setPalettesOpen(false)}
        />
      )}
    </div>
  );
}
