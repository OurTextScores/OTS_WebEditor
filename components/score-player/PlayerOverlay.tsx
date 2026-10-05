import type { MutableRefObject } from 'react';
import type { Positions } from '@/lib/webmscore-loader';

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
 * The click targets and the highlight drawn over the score page. `boxes` are the measures or the notes of the visible
 * page; a click on one calls `onSeek(box)`. The highlight is the sounding measure or note, drawn only on its own page.
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
  onSeek: (box: Box) => void;
}) {
  return (
    <svg
      data-testid="player-overlay"
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
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
      {highlight?.page === currentPage && (
        <g pointerEvents="none">
          <rect
            data-testid={highlightTestId}
            ref={highlightRef}
            x={highlight.x}
            y={highlight.y}
            width={boxWidth(highlight, highlightIsNote)}
            height={highlight.height ?? highlight.sy}
            fill="rgb(8 145 178 / 0.13)"
            stroke="rgb(8 145 178 / 0.8)"
            strokeWidth="2"
          />
          <line
            x1={highlight.x}
            y1={highlight.y}
            x2={highlight.x}
            y2={highlight.y + (highlight.height ?? highlight.sy)}
            stroke="rgb(8 145 178)"
            strokeWidth="4"
          />
        </g>
      )}
    </svg>
  );
}
