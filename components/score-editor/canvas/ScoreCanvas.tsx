import React from 'react';

type Handler<E> = ((event: E) => void) | undefined;

type Props = {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scoreWrapperRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The review gutter scrolls with the score. */
  onScrollTop: ((scrollTop: number) => void) | null;
  insets: { left: number; right: number };
  growsToContent: boolean;
  hiddenUnderRows: boolean;
  loading: boolean;
  hasScore: boolean;
  zoom: number;
  noteInputActive: boolean;
  paletteDropActive: boolean;
  onWrapperClick: React.MouseEventHandler<HTMLDivElement>;
  /** Set only while the score can be edited; each is bound as given. */
  editing: {
    onDoubleClick: React.MouseEventHandler<HTMLDivElement>;
    onPointerDown: Handler<React.PointerEvent<HTMLDivElement>>;
    onPointerMove: Handler<React.PointerEvent<HTMLDivElement>>;
    onPointerUp: Handler<React.PointerEvent<HTMLDivElement>>;
    onPointerCancel: Handler<React.PointerEvent<HTMLDivElement>>;
    onPointerLeave: () => void;
    onMouseDown: Handler<React.MouseEvent<HTMLDivElement>>;
    onMouseMove: Handler<React.MouseEvent<HTMLDivElement>>;
    onMouseUp: Handler<React.MouseEvent<HTMLDivElement>>;
    onContextMenu: Handler<React.MouseEvent<HTMLDivElement>>;
    onDragOver: Handler<React.DragEvent<HTMLDivElement>>;
    onDragLeave: Handler<React.DragEvent<HTMLDivElement>>;
    onDrop: Handler<React.DragEvent<HTMLDivElement>>;
  } | null;
  /** The overlays drawn over the score, inside the zoomed wrapper. */
  children: React.ReactNode;
};

/** The scrolling frame around the score and the zoomed wrapper that holds the engraved SVG and everything drawn over it. */
export function ScoreCanvas({
  scrollContainerRef,
  scoreWrapperRef,
  containerRef,
  onScrollTop,
  insets,
  growsToContent,
  hiddenUnderRows,
  loading,
  hasScore,
  zoom,
  noteInputActive,
  paletteDropActive,
  onWrapperClick,
  editing,
  children,
}: Props) {
  return (
    <div
      ref={scrollContainerRef}
      onScroll={(event) => onScrollTop?.(event.currentTarget.scrollTop)}
      /*
       * The scanner's row view is a vertical stack of clipped
       * bands; nothing in it is meant to scroll sideways. Each
       * band holds a whole page scaled up so that one system
       * fills the box, and the browser counts that clipped
       * drawing toward this container's scroll area — so a
       * horizontal scrollbar ran the width of the editor,
       * dragged 1441px, and revealed nothing, because there was
       * nothing there. Every other mode still scrolls a score
       * that really is wider than the window.
       *
       * `clip`, not `hidden`. `overflow-x: hidden` with a visible
       * y computes y to `auto`, which makes this a scroll
       * container again — and a scroll container cannot grow to
       * its content, which is what rows mode needs so the host
       * can size the frame. `clip` is the one value that leaves
       * the other axis alone.
       */
      /*
       * Hidden under the rows, rather than merely covered by them.
       *
       * It holds a whole engraved page, and in rows mode the compare view
       * is an ordinary block, so anything left in flow here goes on
       * deciding the document's height and with it the frame's. The rows
       * cover it completely either way, so this costs nothing to look at.
       */
      className={`relative z-0 flex-1 bg-slate-50 p-8 ${
        growsToContent ? 'overflow-x-clip overflow-y-visible' : 'overflow-auto'
      } ${hiddenUnderRows ? 'hidden' : ''}`}
      style={
        insets.left || insets.right
          ? {
              paddingLeft: `calc(2rem + ${insets.left}px)`,
              paddingRight: `calc(2rem + ${insets.right}px)`,
            }
          : undefined
      }
    >
      {loading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-xl text-slate-500">Loading score...</div>
        </div>
      )}

      {!loading && !hasScore && (
        <div className="flex items-center justify-center h-full">
          <div className="text-xl text-slate-500">No score loaded. Open a file to begin.</div>
        </div>
      )}

      <div
        ref={scoreWrapperRef}
        className={`relative origin-top-left transition-transform duration-200 ease-out bg-white shadow-raised mx-auto ${paletteDropActive ? 'ring-4 ring-accent/60 ring-offset-2' : ''}`}
        data-testid="score-wrapper"
        data-palette-drop-active={paletteDropActive ? 'true' : 'false'}
        style={{
          transform: `scale(${zoom})`,
          width: 'fit-content',
          cursor: noteInputActive ? 'crosshair' : undefined,
        }}
        onClick={onWrapperClick}
        onDoubleClick={editing?.onDoubleClick}
        onPointerDown={editing?.onPointerDown}
        onPointerMove={editing?.onPointerMove}
        onPointerUp={editing?.onPointerUp}
        onPointerCancel={editing?.onPointerCancel}
        onPointerLeave={editing?.onPointerLeave}
        onMouseDown={editing?.onMouseDown}
        onMouseMove={editing?.onMouseMove}
        onMouseUp={editing?.onMouseUp}
        onContextMenu={editing?.onContextMenu}
        onDragOver={editing?.onDragOver}
        onDragLeave={editing?.onDragLeave}
        onDrop={editing?.onDrop}
      >
        <div ref={containerRef} data-testid="svg-container" />

        {children}
      </div>
    </div>
  );
}
