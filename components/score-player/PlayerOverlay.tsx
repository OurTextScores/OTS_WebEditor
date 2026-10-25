import { memo, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { Positions } from '@/lib/webmscore-loader';
import type { ContinuousCursor } from '@/lib/playback/score-following';

type Box = Positions['elements'][number];

/**
 * Minimum highlight/click width for a note box, in score units. The engine now reports a segment's width as the room
 * layout gave it, so this is only a floor for a box that comes back zero (an engine without that fix, a degenerate
 * score): a zero-width rect is invisible and unclickable, so a note keeps a sliver while the leading line marks its
 * exact x. Measure boxes keep their engine widths untouched.
 */
export const NOTE_MIN_WIDTH = 12;
const boxWidth = (box: Box, isNote: boolean) =>
  isNote ? Math.max(box.width ?? box.sx ?? 0, NOTE_MIN_WIDTH) : (box.width ?? box.sx);

/**
 * The click targets, as their own memoised layer. A page can carry a thousand of them (every note of a quartet), and the
 * player re-renders every animation frame while playing; only a change of page or mode should rebuild them.
 */
const ClickTargets = memo(function ClickTargets({
  boxes,
  boxesAreNotes,
  onSeek,
}: {
  boxes: readonly Box[];
  boxesAreNotes: boolean;
  onSeek: (box: Box) => void;
}) {
  return (
    <>
      {boxes.map((box) => (
        <rect
          key={box.id}
          x={box.x}
          y={box.y}
          width={boxWidth(box, boxesAreNotes)}
          height={box.height ?? box.sy}
          fill="transparent"
          pointerEvents="all"
          className="cursor-pointer"
          onClick={() => onSeek(box)}
        />
      ))}
    </>
  );
});

/**
 * The click targets and the highlight drawn over the score page. `boxes` are the measures or the notes of the visible
 * page; a click on one calls `onSeek(box)`. The highlight is the sounding measure, drawn only on its own page. A note is
 * not boxed: its head is coloured in the score itself (`useNoteheadColor`), so its rect here is invisible and only
 * anchors the follow-scroll and the tests.
 */
export default function PlayerOverlay({
  pageSize,
  boxes,
  boxesAreNotes,
  highlight,
  highlightIsNote,
  highlightTestId,
  currentPage,
  highlightRef,
  cursor = null,
  onSeek,
}: {
  pageSize: { width: number; height: number };
  boxes: readonly Box[];
  boxesAreNotes: boolean;
  highlight: Box | null;
  highlightIsNote: boolean;
  highlightTestId: string;
  currentPage: number;
  highlightRef: MutableRefObject<SVGRectElement | null>;
  /** The engine-mapped moving cursor; when present it replaces the measure's leading line. */
  cursor?: ContinuousCursor | null;
  onSeek: (box: Box) => void;
}) {
  const movingCursor = cursor?.geometry && cursor.page === currentPage ? cursor : null;
  // The latest handler without a new identity per render, so the memoised layer below is not rebuilt each frame.
  const latestSeek = useRef(onSeek);
  useEffect(() => {
    latestSeek.current = onSeek;
  });
  const seek = useCallback((box: Box) => latestSeek.current(box), []);
  return (
    <svg
      data-testid="player-overlay"
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <ClickTargets boxes={boxes} boxesAreNotes={boxesAreNotes} onSeek={seek} />
      {highlight?.page === currentPage && (
        <g pointerEvents="none">
          <rect
            data-testid={highlightTestId}
            ref={highlightRef}
            x={highlight.x}
            y={highlight.y}
            width={boxWidth(highlight, highlightIsNote)}
            height={highlight.height ?? highlight.sy}
            fill={highlightIsNote ? 'none' : 'rgb(8 145 178 / 0.13)'}
            stroke={highlightIsNote ? 'none' : 'rgb(8 145 178 / 0.8)'}
            strokeWidth="2"
          />
          {!highlightIsNote && !movingCursor && (
            <line
              x1={highlight.x}
              y1={highlight.y}
              x2={highlight.x}
              y2={highlight.y + (highlight.height ?? highlight.sy)}
              stroke="rgb(8 145 178)"
              strokeWidth="4"
            />
          )}
        </g>
      )}
      {movingCursor && (
        <rect
          data-testid="player-cursor"
          pointerEvents="none"
          x={movingCursor.x}
          y={movingCursor.y}
          width={movingCursor.width}
          height={movingCursor.height}
          fill="rgb(8 145 178)"
        />
      )}
    </svg>
  );
}
