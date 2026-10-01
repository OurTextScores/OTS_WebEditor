import React from 'react';

/**
 * The page controls and the "finalizing layout" banner that sat above the score before the
 * status bar existed. Kept for `?shell=legacy` only; the v2 shell shows the same state in
 * the status bar. Moved out of `ScoreEditor` unchanged, and deleted with the flag (Phase 5).
 */
export interface LegacyCanvasChromeProps {
  interactionPreparing: boolean;
  progressiveLoadEnabled: boolean;
  onToggleProgressiveLoad: () => void;
  currentPage: number;
  pageCount: number;
  pageCountIsFloor: boolean;
  onPageSelect: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  /** The last known page is not the end: more are still being laid out. */
  canAdvancePastEnd: boolean;
}

export function LegacyCanvasChrome({
  interactionPreparing,
  progressiveLoadEnabled,
  onToggleProgressiveLoad,
  currentPage,
  pageCount,
  pageCountIsFloor,
  onPageSelect,
  onPrevPage,
  onNextPage,
  canAdvancePastEnd,
}: LegacyCanvasChromeProps) {
  return (
    <>
      {interactionPreparing && (
        <div
          data-testid="interaction-preparing-banner"
          className="mb-3 flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <div>
            <div className="font-medium">Finalizing interactive layout...</div>
            <div className="text-xs text-amber-800">
              Viewing and page playback are available. Note selection, note editing, and selection
              playback will unlock when relayout finishes.
            </div>
          </div>
          <div className="shrink-0 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Preparing
          </div>
        </div>
      )}
      <div className="mb-3 flex items-center justify-end gap-2 text-sm text-gray-600">
        <button
          type="button"
          onClick={onToggleProgressiveLoad}
          className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
          title="Applies to future score loads"
        >
          Progressive load: {progressiveLoadEnabled ? 'On' : 'Off'}
        </button>
        <span data-testid="page-indicator">
          Page {currentPage + 1} of {pageCountIsFloor ? `${pageCount}+` : pageCount}
        </span>
        <select
          className="px-2 py-1 border border-gray-300 rounded bg-white text-sm"
          onChange={onPageSelect}
          value={currentPage}
          data-testid="page-select"
        >
          {Array.from({ length: pageCount }, (_, index) => (
            <option key={index} value={index}>
              Page {index + 1}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onPrevPage}
          disabled={currentPage <= 0}
          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={onNextPage}
          disabled={currentPage >= pageCount - 1 && !canAdvancePastEnd}
          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </>
  );
}
