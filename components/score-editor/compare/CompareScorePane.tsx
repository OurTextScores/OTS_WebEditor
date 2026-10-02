import type { CSSProperties, MouseEventHandler, RefObject } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { ComparePaneEditorControls } from '../ComparePaneEditorControls';
import type { CompareSide, CompareTransportState } from './compare-types';

type PositionedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type HighlightRect = PositionedRect & {
  id: string | number;
  status?: string;
  /**
   * How the rect was located vertically: 'staff' means the engine reported the real
   * staff box, 'even' means it fell back to slicing the system box into equal bands.
   * Surfaced as a data attribute so the fallback is observable rather than silent.
   */
  geometry?: 'staff' | 'even';
};

type SelectionRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type CursorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  voice: number;
};

export type CompareScorePaneModel = {
  side: CompareSide;
  label: string;
  isCurrent: boolean;
  isActive: boolean;
  embedded: boolean;
  scoreAvailable: boolean;
  editorBusy: boolean;
  noteInputActive: boolean;
  zoom: number;
  wrapperStyle: CSSProperties;
  transport: CompareTransportState;
  checkpoint: null | {
    label: string;
    busy: boolean;
  };
  viewportStatus: null | {
    message: string;
    overlay: boolean;
  };
  diffHighlights: HighlightRect[];
  positiveDiffStatus: string;
  negativeDiffStatus: string | null;
  commentedHighlights: HighlightRect[];
  threadedHighlights: HighlightRect[];
  selectionRects: SelectionRect[];
  noteInputCursor: null | {
    rect: CursorRect;
    color: string;
  };
  focusedHighlight: PositionedRect | null;
  measureHitAreaAvailable: boolean;
};

export type CompareScorePaneActions = {
  activate: () => void;
  openInEditor: null | (() => void);
  togglePlayPause: () => void;
  stop: () => void;
  setCheckpointLabel: (label: string) => void;
  saveCheckpoint: () => void;
  zoomOut: () => void;
  zoomIn: () => void;
  addBar: () => void;
  toggleNoteInput: () => void;
  openPalettes: () => void;
  clickScore: MouseEventHandler<HTMLDivElement>;
};

export type CompareScorePaneRefs = {
  scroll: RefObject<HTMLDivElement | null>;
  wrapper: RefObject<HTMLDivElement | null>;
  container: RefObject<HTMLDivElement | null>;
};

type CompareScorePaneProps = {
  model: CompareScorePaneModel;
  actions: CompareScorePaneActions;
  paneRefs: CompareScorePaneRefs;
};

const rectStyle = (rect: PositionedRect): CSSProperties => ({
  left: `${rect.left}px`,
  top: `${rect.top}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`,
});

export function CompareScorePane({
  model,
  actions,
  paneRefs: { scroll: scrollRef, wrapper: wrapperRef, container: containerRef },
}: CompareScorePaneProps) {
  const { side, transport } = model;
  const transportActive = transport.isPlaying || transport.isPaused;
  const playTitle =
    transport.isPlaying && !transport.isPaused ? 'Pause' : transport.isPaused ? 'Resume' : 'Play';

  return (
    <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        <div className="flex items-center gap-2">
          <span>{model.label}</span>
          {!model.isCurrent && (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-caption font-normal text-blue-700">
              Checkpoint
            </span>
          )}
          {model.embedded && actions.openInEditor && (
            <button
              type="button"
              onClick={actions.openInEditor}
              className="rounded border border-blue-500 bg-blue-50 px-2 py-0.5 text-caption font-normal text-blue-700 hover:bg-blue-100"
              title="Open this score in the full editor"
            >
              📝 Open in Editor
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid={`btn-compare-play-${side}`}
              onClick={actions.togglePlayPause}
              disabled={!model.scoreAvailable || (transport.isBusy && !transportActive)}
              className="rounded border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title={playTitle}
            >
              {transport.isPlaying && !transport.isPaused ? (
                <Pause size={12} />
              ) : (
                <Play size={12} />
              )}
            </button>
            <button
              type="button"
              data-testid={`btn-compare-stop-${side}`}
              onClick={actions.stop}
              disabled={!transportActive}
              className="rounded border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Stop"
            >
              <Square size={12} />
            </button>
          </div>
        </div>
        {model.checkpoint && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={model.checkpoint.label}
              onChange={(event) => actions.setCheckpointLabel(event.target.value)}
              placeholder="Label (optional)"
              className="w-32 rounded border border-slate-300 bg-white px-2 py-0.5 text-caption text-slate-700 placeholder-slate-400"
            />
            <button
              type="button"
              onClick={actions.saveCheckpoint}
              disabled={model.checkpoint.busy}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-caption font-normal text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title={model.isCurrent ? 'Save current score as checkpoint' : 'Save this checkpoint'}
            >
              💾 Save checkpoint
            </button>
          </div>
        )}
      </div>
      <ComparePaneEditorControls
        side={side}
        active={model.isActive}
        busy={model.editorBusy}
        noteInputActive={model.noteInputActive}
        zoom={model.zoom}
        onActivate={actions.activate}
        onZoomOut={actions.zoomOut}
        onZoomIn={actions.zoomIn}
        onAddBar={actions.addBar}
        onToggleNoteInput={actions.toggleNoteInput}
        onOpenPalettes={actions.openPalettes}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div
          ref={scrollRef}
          className={`relative min-h-0 min-w-0 flex-1 overflow-auto rounded border bg-white ${model.isActive ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}
          data-testid={`compare-pane-${side}`}
          onPointerDown={actions.activate}
        >
          {model.viewportStatus && (
            <div
              className={
                model.viewportStatus.overlay
                  ? 'absolute inset-0 flex items-center justify-center bg-white/80 p-3 text-xs text-slate-500'
                  : 'p-3 text-xs text-slate-500'
              }
            >
              {model.viewportStatus.message}
            </div>
          )}
          <div
            ref={wrapperRef}
            data-testid={`compare-score-wrapper-${side}`}
            className="relative origin-top-left"
            style={model.wrapperStyle}
          >
            <div ref={containerRef} />
            <div className="pointer-events-none absolute inset-0 z-10">
              {model.diffHighlights.map((highlight) => {
                const positive = model.negativeDiffStatus
                  ? highlight.status !== model.negativeDiffStatus
                  : highlight.status === model.positiveDiffStatus;
                return (
                  <div
                    key={`compare-${side}-highlight-${highlight.id}`}
                    data-testid={`compare-${side}-highlight`}
                    data-geometry={highlight.geometry ?? 'even'}
                    data-highlight-id={String(highlight.id)}
                    className="absolute rounded border-2"
                    style={{
                      ...rectStyle(highlight),
                      backgroundColor: positive
                        ? 'rgba(16, 185, 129, 0.3)'
                        : 'rgba(244, 63, 94, 0.3)',
                      borderColor: positive ? 'rgb(16, 185, 129)' : 'rgb(244, 63, 94)',
                    }}
                  />
                );
              })}
              {model.commentedHighlights.map((highlight) => (
                <div
                  key={`compare-${side}-comment-${highlight.id}`}
                  className="absolute rounded border-2"
                  style={{
                    ...rectStyle(highlight),
                    backgroundColor: 'rgba(245, 158, 11, 0.25)',
                    borderColor: 'rgb(245, 158, 11)',
                  }}
                />
              ))}
              {model.threadedHighlights.map((highlight) => (
                <div
                  key={`compare-${side}-thread-${highlight.id}`}
                  data-testid={`compare-${side}-thread-highlight`}
                  className="absolute rounded border-2"
                  style={{
                    ...rectStyle(highlight),
                    backgroundColor: 'rgba(16, 185, 129, 0.35)',
                    borderColor: 'rgb(5, 150, 105)',
                  }}
                />
              ))}
              {model.isActive &&
                model.selectionRects.map((rect, index) => (
                  <div
                    key={`compare-${side}-selection-${index}`}
                    data-testid={`compare-selection-overlay-${side}`}
                    aria-hidden="true"
                    className="absolute border-2 border-blue-600"
                    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                  />
                ))}
              {model.noteInputCursor && (
                <div
                  data-testid={`compare-note-input-cursor-${side}`}
                  data-voice={model.noteInputCursor.rect.voice}
                  aria-hidden="true"
                  className="pointer-events-none absolute z-10"
                  style={{
                    left: model.noteInputCursor.rect.x,
                    top: model.noteInputCursor.rect.y,
                    width: model.noteInputCursor.rect.width,
                    height: model.noteInputCursor.rect.height,
                    backgroundColor: `${model.noteInputCursor.color}32`,
                    borderLeft: `3px solid ${model.noteInputCursor.color}`,
                  }}
                />
              )}
              {model.focusedHighlight && (
                <div
                  className="absolute rounded border-2 border-blue-500 ring-2 ring-blue-300/50"
                  style={rectStyle(model.focusedHighlight)}
                />
              )}
              {model.measureHitAreaAvailable && (
                <div
                  className="absolute inset-0 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                  title="Click to select this score and an element; click its bar to annotate"
                  onClick={actions.clickScore}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
