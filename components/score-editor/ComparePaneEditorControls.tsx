'use client';

import type { CompareSide } from './compare/compare-types';

export function ComparePaneEditorControls({
  side,
  active,
  busy,
  noteInputActive,
  zoom,
  onActivate,
  onZoomOut,
  onZoomIn,
  onAddBar,
  onToggleNoteInput,
  onOpenPalettes,
}: {
  side: CompareSide;
  active: boolean;
  busy: boolean;
  noteInputActive: boolean;
  zoom: number;
  onActivate: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onAddBar: () => void;
  onToggleNoteInput: () => void;
  onOpenPalettes: () => void;
}) {
  const buttonClass =
    'rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-gray-700 hover:bg-gray-50 disabled:opacity-50';
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      data-testid={`compare-editor-controls-${side}`}
    >
      <button
        type="button"
        data-testid={`btn-compare-activate-${side}`}
        aria-pressed={active}
        onClick={onActivate}
        className={`${buttonClass} ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : ''}`}
        title="Make this score the target for keyboard shortcuts and palettes"
      >
        {active ? 'Active score' : 'Edit'}
      </button>
      <button
        type="button"
        data-testid={`btn-compare-zoom-out-${side}`}
        onClick={onZoomOut}
        className={buttonClass}
        title="Zoom both compare panes out"
      >
        −
      </button>
      <span
        data-testid={`compare-zoom-value-${side}`}
        className="min-w-9 text-center text-[10px] font-normal normal-case tracking-normal text-gray-500"
      >
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        data-testid={`btn-compare-zoom-in-${side}`}
        onClick={onZoomIn}
        className={buttonClass}
        title="Zoom both compare panes in"
      >
        +
      </button>
      <button
        type="button"
        data-testid={`btn-compare-add-bar-${side}`}
        disabled={busy}
        onClick={onAddBar}
        className={buttonClass}
        title="Add one bar at the end of this score"
      >
        + Bar
      </button>
      <button
        type="button"
        data-testid={`btn-compare-note-input-${side}`}
        aria-pressed={noteInputActive}
        aria-label={`${noteInputActive ? 'Disable' : 'Enable'} note input for ${side} compare score`}
        disabled={busy}
        onClick={onToggleNoteInput}
        className={`${buttonClass} ${noteInputActive ? 'border-blue-500 bg-blue-50 text-blue-700' : ''}`}
        title="Toggle note input for this score (N)"
      >
        {noteInputActive ? 'Stop input' : 'Note input'}
      </button>
      <button
        type="button"
        data-testid={`btn-compare-palettes-${side}`}
        disabled={busy}
        onClick={onOpenPalettes}
        className={buttonClass}
        title="Open floating palettes for this score"
      >
        Palettes
      </button>
    </div>
  );
}
