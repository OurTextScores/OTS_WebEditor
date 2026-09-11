'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

import { loadWebMscore, type Score } from '@/lib/webmscore-loader';
import {
  withForcedSystemBreaks,
  withSystemSpacing,
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

const RENDER_WIDTH = 1400;

type Rendered = { svg: string; width: number; height: number };

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

async function renderScoped(xml: string, startIndexes: number[]): Promise<Rendered | null> {
  const WebMscore = await loadWebMscore();
  const reflowed = withSystemSpacing(withForcedSystemBreaks(xml, startIndexes));
  let score: Score | null = null;
  try {
    score = await WebMscore.load('xml', new TextEncoder().encode(reflowed));
    if (!score) return null;
    // `true` for selection highlighting: MuseScore colours the selection itself and the
    // colour comes back in the SVG. Without it a click selects correctly and draws a
    // score with no visible selection, which reads as a dead control.
    const svg = await score.saveSvg(0, true, true);
    const positions = await score.measurePositions();
    const pageWidth = positions?.pageSize?.width || RENDER_WIDTH;
    const pageHeight = positions?.pageSize?.height || 0;
    const scale = RENDER_WIDTH / Math.max(1, pageWidth);
    return { svg, width: RENDER_WIDTH, height: pageHeight * scale };
  } finally {
    try {
      score?.destroy();
    } catch {
      // A score that will not close is not a reason to lose the view.
    }
  }
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
  const current = groups[Math.min(index, Math.max(0, groups.length - 1))];

  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderToken = useRef(0);

  const document = useMergedScoreDocument({
    state: merged,
    resolveUrl,
    prepare: (persisted) => ({ xml: persisted ?? xml, baselineMeasures: 0 }),
    sourceEngineId: engineId,
    // Every bar edited here is attributed to the finding being answered, not to a
    // disagreement between engines.
    finding: current ? { kind: current.kind, part: current.findings[0]?.part } : null,
  });

  useEffect(() => {
    onMergedScoreChange?.(document.score);
  }, [document.score, onMergedScoreChange]);

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
        part: current.findings[0]?.part ?? null,
        // The host derives the profile amendment from this, so it travels too. Without
        // it the "widen the profile" control could never appear.
        message: current.findings[0]?.message ?? '',
        index,
        total: groups.length,
        places: current.findings.length,
      },
      '*',
    );
  }, [current, groups.length, index]);

  // Reflow onto the systems this kind actually touches. A reviewer who stepped to an
  // issue is not asking about the lines it does not fall on.
  const starts = useMemo(() => {
    // `ScannerSystem` is two-sided down to its type, because it was built for the diff.
    // With one reading the host fills the left side and leaves the right empty, so this
    // reads `leftMeasureIndexes` -- a naming inheritance, not a claim that there is a
    // second reading somewhere.
    const firstMeasure = (system: ScannerSystem) => system.leftMeasureIndexes?.[0] ?? 0;
    if (!current || current.systems.length === 0) {
      return systems.map(firstMeasure);
    }
    return current.systems
      .map((systemIndex) => systems.find((s) => s.systemIndex === systemIndex))
      .filter((system): system is ScannerSystem => Boolean(system))
      .map(firstMeasure);
  }, [current, systems]);

  useEffect(() => {
    const token = ++renderToken.current;
    const source = document.score ? null : xml;
    const draw = async () => {
      try {
        const xmlToDraw = source ?? (await document.exportXml());
        if (!xmlToDraw) return;
        const next = await renderScoped(xmlToDraw, starts);
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
    // `revision` rises on every render-affecting change, which is what makes an edit
    // show up without re-fetching the document.
  }, [document, starts, xml, document.revision]);

  if (groups.length === 0) return null;

  const shownSystems = (current?.systems ?? [])
    .map((systemIndex) => systems.find((system) => system.systemIndex === systemIndex))
    .filter((system): system is ScannerSystem => Boolean(system));

  return (
    <section data-testid="finding-rows" className="flex flex-col gap-3 p-4">
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
            {current.findings[0]?.part ? ` · ${current.findings[0].part}` : ''}
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

      <p className="text-xs text-gray-600" data-testid="finding-rows-message">
        {current.findings[0]?.message}
      </p>

      {shownSystems.length === 0 ? (
        // Page-level findings name no system. They are real and worth showing, but there
        // is no strip to show, and inventing one would point at the wrong place.
        <p className="text-xs text-gray-500" data-testid="finding-rows-no-location">
          This one is about the page as a whole, not a particular system.
        </p>
      ) : (
        shownSystems.map((system) => (
          <ScanStrip key={system.systemIndex} system={system} resolveUrl={resolveUrl} />
        ))
      )}

      <div className="rounded border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-1.5">
          <span className="text-xs font-medium text-gray-700">{label}</span>
          <span className="text-xs text-gray-500" data-testid="finding-rows-status">
            {document.saving
              ? 'Saving…'
              : document.dirty
                ? 'Unsaved changes'
                : document.loading
                  ? 'Loading…'
                  : 'Saved'}
          </span>
        </div>
        {renderError ? (
          <p role="alert" className="p-3 text-xs text-red-700">
            {renderError}
          </p>
        ) : rendered ? (
          <div
            data-testid="finding-rows-score"
            className="w-full"
            dangerouslySetInnerHTML={{ __html: rendered.svg }}
          />
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
