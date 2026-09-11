'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

import { type Score } from '@/lib/webmscore-loader';
import {
  renderSide,
  type RenderedSide,
  type ScannerSystem,
} from './ScannerSystemRows';
import {
  useMergedScoreDocument,
  type MergedScoreState,
} from './useMergedScoreDocument';

/**
 * One cross-staff finding at a time, with the scan beside the reading.
 *
 * Deliberately not `ScannerSystemRows` with a side removed. That view is a two-column
 * diff with a merge gutter: `mergeSource` is left-or-right, differences read "appears
 * only in {rightLabel}", and it returns early without both documents. A finding has no
 * second reading to compare against -- findings arrive on single-engine jobs, where only
 * one engine ever read the page -- so a column is not missing here, it never existed.
 * Threading optionality through that component would have put the working merge view at
 * risk to express something it does not mean.
 *
 * What the two share is geometry and the save path, and both are already separable:
 * `withForcedSystemBreaks`/`withSystemSpacing` reflow a document onto the scan's systems,
 * and `useMergedScoreDocument` writes `effectivePageMusicXml` for however many engines
 * succeeded.
 *
 * **One issue at a time, stepping through kinds rather than findings.** Eleven identical
 * layout deviations are one thing with a count, not eleven things; a reviewer stepping
 * through them individually would answer the same question eleven times, and dispositions
 * are recorded per kind and part for exactly that reason.
 */

export type FindingRowsFinding = {
  kind: string;
  message: string;
  system?: number;
  staffIndices?: number[];
  part?: string;
};

/** A kind, its findings, and the systems they point at. */
type IssueGroup = {
  kind: string;
  findings: FindingRowsFinding[];
  /** Systems this kind touches, in page order, deduplicated. */
  systems: number[];
};

export function groupFindingsByKind(findings: FindingRowsFinding[]): IssueGroup[] {
  const byKind = new Map<string, FindingRowsFinding[]>();
  for (const finding of findings || []) {
    byKind.set(finding.kind, [...(byKind.get(finding.kind) ?? []), finding]);
  }
  return [...byKind.entries()].map(([kind, group]) => ({
    kind,
    findings: group,
    systems: [
      ...new Set(
        group
          .map((finding) => finding.system)
          .filter((value): value is number => Number.isInteger(value)),
      ),
    ].sort((first, second) => first - second),
  }));
}

/**
 * The window onto one system, in the drawing's own pixels.
 *
 * The engraving is drawn whole and then a band of it is shown, exactly as the comparison
 * rows do: scaled so the system fills the pane, translated so it starts at the origin,
 * and clipped. Showing the page entire was the alternative, and at a 2,977px drawing in
 * a 1,000px box it made every note too small to read.
 */
function systemWindow(
  rendered: RenderedSide | null,
  measureIndexes: readonly number[],
): { left: number; top: number; width: number; height: number } | null {
  if (!rendered || measureIndexes.length === 0) return null;
  const boxes = measureIndexes
    .map((index) => rendered.measures[index])
    .filter((box): box is NonNullable<typeof box> => Boolean(box));
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  /*
   * Generous vertical air, because a measure box is only the staff.
   *
   * Everything that decides a reading -- beams above, ledger lines, slurs, the dynamics
   * under the system -- sits outside the staff lines, and a box hugging them showed a
   * 72px slot with nothing recognisable in it. A staff's height again on each side is
   * roughly what the comparison panes show for one system.
   */
  const staffHeight = Math.max(1, bottom - top);
  const pad = Math.max(40, staffHeight);
  return {
    left,
    top: Math.max(0, top - pad),
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top + pad * 2),
  };
}

/**
 * The scan strip for one system.
 *
 * Simpler than the merge view's equivalent on purpose: no staff-row windowing and no
 * difference overlays, because there is no second reading to point at. A crop is
 * signature-bound and the server refuses it once the job moves on, which an `<img>`
 * cannot report -- so a failure is stated rather than left as a broken image, which
 * would read as a bug in the page rather than a scan that has been superseded.
 */
function ScanStrip({
  system,
  resolveUrl,
}: {
  system: ScannerSystem;
  resolveUrl: (relative: string) => string;
}) {
  const [stale, setStale] = useState(false);
  if (!system.cropUrl) return null;
  if (stale) {
    return (
      <p
        role="alert"
        className="mb-2 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] text-amber-900"
      >
        This scan crop is no longer current. Reload the page to see the scan as it stands
        now.
      </p>
    );
  }
  // The endpoint pads the semantic bounds before extracting the bitmap, so size against
  // that exact rectangle; using `region` clips the padding.
  const crop = system.cropRegion || system.region;
  const width = crop ? Math.max(1, crop[2] - crop[0]) : 1400;
  const height = crop ? Math.max(1, crop[3] - crop[1]) : 400;
  return (
    <div className="mb-2 overflow-hidden rounded border border-gray-200 bg-white">
      <Image
        src={resolveUrl(system.cropUrl)}
        alt={`Scan of system ${system.systemIndex + 1}`}
        width={width}
        height={height}
        unoptimized
        onError={() => setStale(true)}
        className="w-full object-contain"
      />
    </div>
  );
}

export function ScannerFindingRows({
  systems,
  findings,
  xml,
  label,
  engineId,
  merged,
  resolveUrl,
  onMergedScoreChange,
  titleFor,
}: {
  systems: ScannerSystem[];
  findings: FindingRowsFinding[];
  xml: string;
  label: string;
  engineId: string;
  merged: MergedScoreState | null;
  resolveUrl: (relative: string) => string;
  /**
   * The merged score itself, not its state -- the host keeps it for playback and the
   * comparison view reports the same thing. Named for the merge view it came from.
   */
  onMergedScoreChange?: (score: Score | null) => void;
  /** Host-supplied copy, so the wording lives with the rest of the scanner's. */
  titleFor?: (kind: string) => string;
}) {
  const groups = useMemo(() => groupFindingsByKind(findings), [findings]);
  const [index, setIndex] = useState(0);
  /**
   * Which example of this kind is on screen.
   *
   * Two levels, because "eleven places" is eleven things to look at even though it is
   * one thing to decide. The outer level steps between questions; the inner steps
   * between the places that raise the same question. Showing all eleven at once made the
   * page seven thousand pixels tall and asked the reviewer to find the relevant one.
   */
  const [exampleIndex, setExampleIndex] = useState(0);
  const current = groups[Math.min(index, Math.max(0, groups.length - 1))];
  const examples = current?.findings ?? [];
  const example = examples[Math.min(exampleIndex, Math.max(0, examples.length - 1))];

  // A new question starts at its first example rather than wherever the last one left
  // off, which would land on an arbitrary place in a different part of the page.
  useEffect(() => {
    setExampleIndex(0);
  }, [index]);

  const [rendered, setRendered] = useState<RenderedSide | null>(null);
  /** The box the drawing has to fit, measured rather than assumed. */
  const [paneWidth, setPaneWidth] = useState(0);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderToken = useRef(0);

  const document = useMergedScoreDocument({
    state: merged,
    resolveUrl,
    prepare: (persisted) => ({ xml: persisted ?? xml, baselineMeasures: 0 }),
    sourceEngineId: engineId,
    // Every bar edited here is attributed to the finding being answered, not to a
    // disagreement between engines. The example's own part, not the kind's first: one
    // kind can raise the same question about several parts, and an edit made while
    // looking at the viola must not be filed against the cello.
    finding: current ? { kind: current.kind, part: example?.part } : null,
  });

  useEffect(() => {
    onMergedScoreChange?.(document.score);
  }, [document.score, onMergedScoreChange]);

  useEffect(() => {
    const node = paneRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    /*
     * Ignore sub-pixel width changes.
     *
     * This width decides the scale, the scale decides the drawn height, the height is
     * reported to the host, and the host resizes the frame -- which can nudge this width
     * back by a fraction when a scrollbar comes and goes. Rounding stops that settling
     * into a standing oscillation between two nearly-equal widths.
     */
    const measure = () => {
      const next = Math.round(node.clientWidth);
      setPaneWidth((current) => (Math.abs(current - next) >= 1 ? next : current));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * Tell the host which issue is on screen.
   *
   * The decision controls live in the host, because a disposition is a scanner concept
   * with a scanner API behind it, and this embed reaches that process only through the
   * host's proxy. So the host has to know what the reviewer is looking at, or its
   * controls would answer a different question from the one being shown -- which is the
   * failure the original buttons had, in a new place.
   *
   * Same `ots-` envelope and same wildcard target as the height message beside it.
   */
  useEffect(() => {
    if (!current || typeof window === 'undefined' || window.parent === window) return;
    window.parent.postMessage(
      {
        type: 'ots-finding-issue',
        kind: current.kind,
        // The example's part and words, not the kind's first. A decision is recorded
        // against a kind *and part*, so a host showing controls for the wrong part would
        // record the wrong decision.
        part: example?.part ?? null,
        // The host derives the profile amendment from this, so it travels too. Without
        // it the "widen the profile" control could never appear.
        message: example?.message ?? '',
        index,
        total: groups.length,
        places: current.findings.length,
        exampleIndex: Math.min(exampleIndex, Math.max(0, examples.length - 1)),
      },
      '*',
    );
  }, [current, example, examples.length, exampleIndex, groups.length, index]);

  // Reflow onto the systems this kind actually touches. A reviewer who stepped to an
  // issue is not asking about the lines it does not fall on.
  const shownSystem = useMemo(() => {
    if (!Number.isInteger(example?.system)) return undefined;
    return systems.find((system) => system.systemIndex === example?.system);
  }, [example, systems]);

  /**
   * Every system's first bar, so the engraving breaks where the scan breaks.
   *
   * Not just the example's: a single break leaves the rest of the page to flow however
   * MuseScore likes, so the bars this example covers end up sharing an engraved line
   * with bars from the next system, and the window onto them frames the wrong music.
   * The comparison rows pass every start for the same reason.
   *
   * `ScannerSystem` is two-sided down to its type because it was built for the diff;
   * with one reading the host fills the left side. That is a naming inheritance, not a
   * claim that a second reading exists.
   */
  const starts = useMemo(
    () =>
      systems
        .map((system) => system.leftMeasureIndexes?.[0])
        .filter((value): value is number => Number.isInteger(value)),
    [systems],
  );

  /**
   * The document object itself is never a dependency.
   *
   * `useMergedScoreDocument` returns a fresh object literal on every render, so naming
   * it here made the effect run after every render it had itself caused: draw, set
   * state, re-render, new object, draw again. Each turn of that loop loaded WebMscore
   * and engraved a whole score, which ate the machine and eventually took the page down.
   *
   * A ref carries the live document in without joining the dependency list; what the
   * effect actually keys on is the revision, which is what `useMergedScoreDocument`
   * raises on every render-affecting change, and whether a score exists yet.
   */
  const documentRef = useRef(document);
  documentRef.current = document;
  const revision = document.revision;
  const hasScore = Boolean(document.score);

  useEffect(() => {
    const token = ++renderToken.current;
    const draw = async () => {
      try {
        const live = documentRef.current;
        const xmlToDraw = live.score ? await live.exportXml() : xml;
        if (!xmlToDraw) return;
        const next = await renderSide(xmlToDraw, starts);
        if (renderToken.current === token) {
          setRendered(next);
          setRenderError(null);
        }
      } catch (error) {
        if (renderToken.current === token) {
          setRenderError(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void draw();
  }, [starts, xml, revision, hasScore]);

  if (groups.length === 0) return null;

  // The band this example falls in, and how much to scale it so it fills the pane.
  // Without a window -- a page-level finding, or a document whose measures could not be
  // counted -- the whole drawing is shown, fitted rather than cropped.
  const band = systemWindow(rendered, shownSystem?.leftMeasureIndexes ?? []);
  const fitWidth = band?.width ?? rendered?.width ?? 1;
  const scale = paneWidth && fitWidth ? paneWidth / fitWidth : 1;


  return (
    <section ref={paneRef} data-testid="finding-rows" className="flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {titleFor ? titleFor(current.kind) : current.kind.replace(/_/g, ' ')}
          </p>
          <p className="text-xs text-gray-500">
            <span data-testid="finding-rows-position">
              Issue {index + 1} of {groups.length}
            </span>
            {' · '}
            <span data-testid="finding-rows-count">
              {current.findings.length}{' '}
              {current.findings.length === 1 ? 'place' : 'places'}
            </span>
            {example?.part ? ` · ${example.part}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="finding-rows-prev"
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40"
          >
            ← Previous issue
          </button>
          <button
            type="button"
            data-testid="finding-rows-next"
            disabled={index >= groups.length - 1}
            onClick={() => setIndex((value) => Math.min(groups.length - 1, value + 1))}
            className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40"
          >
            Next issue →
          </button>
        </div>
      </header>

      {examples.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
          <span className="text-xs text-gray-500" data-testid="finding-rows-example-position">
            Example {Math.min(exampleIndex, examples.length - 1) + 1} of {examples.length}
          </span>
          <button
            type="button"
            data-testid="finding-rows-example-prev"
            disabled={exampleIndex === 0}
            onClick={() => setExampleIndex((value) => Math.max(0, value - 1))}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs disabled:opacity-40"
          >
            ← Previous example
          </button>
          <button
            type="button"
            data-testid="finding-rows-example-next"
            disabled={exampleIndex >= examples.length - 1}
            onClick={() =>
              setExampleIndex((value) => Math.min(examples.length - 1, value + 1))
            }
            className="rounded border border-gray-300 px-2 py-0.5 text-xs disabled:opacity-40"
          >
            Next example →
          </button>
        </div>
      )}

      <p className="text-xs text-gray-600" data-testid="finding-rows-message">
        {example?.message}
      </p>

      {!shownSystem ? (
        // A finding with no system is about the page, not a place on it. It is real and
        // worth showing, but there is no strip, and inventing one would point somewhere
        // wrong.
        <p className="text-xs text-gray-500" data-testid="finding-rows-no-location">
          This one is about the page as a whole, not a particular system.
        </p>
      ) : (
        // One strip, for the example on screen. Eleven at once made the page seven
        // thousand pixels tall and left the reviewer to find the relevant one.
        <ScanStrip system={shownSystem} resolveUrl={resolveUrl} />
      )}

      <div className="rounded border border-gray-200 bg-white">
        {/*
          No label or save state here.
          
          The label said "This reading" beside the only reading on screen, and the state
          said "Saved" about a document nobody had edited. Both spent a row of the page
          restating what the reviewer could already see. Saving state is worth showing
          once there is an edit to lose; until then it is noise where the music should be.
        */}
        {renderError ? (
          <p role="alert" className="p-3 text-xs text-red-700">
            {renderError}
          </p>
        ) : rendered ? (
          <div
            className="w-full overflow-clip"
            style={{ height: Math.max(1, (band?.height ?? rendered.pageHeight) * scale) }}
          >
            <div
              data-testid="finding-rows-score"
              className="origin-top-left"
              style={{
                width: rendered.width,
                transform: band
                  ? `scale(${scale}) translate(${-band.left}px, ${-band.top}px)`
                  : `scale(${scale})`,
              }}
              dangerouslySetInnerHTML={{ __html: rendered.svg }}
            />
          </div>
        ) : (
          <p className="p-3 text-xs text-gray-500">Drawing the reading…</p>
        )}
      </div>

      {document.error && (
        <p role="alert" className="text-xs text-red-700">
          {document.error}
        </p>
      )}
    </section>
  );
}
