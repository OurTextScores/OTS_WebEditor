import React from 'react';

type Props = {
  active: boolean;
  currentPage: number;
  cursorRect: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    voice: number;
  } | null;
  cursorColor: string;
  shadow: { x: number; y: number; w: number; h: number } | null;
};

/** The note-input cursor on the current page and the shadow note that follows the pointer. */
export function NoteInputOverlays({ active, currentPage, cursorRect, cursorColor, shadow }: Props) {
  return (
    <>
      {active && cursorRect && cursorRect.page === currentPage && (
        <div
          data-testid="note-input-cursor"
          data-voice={cursorRect.voice}
          aria-hidden="true"
          className="absolute pointer-events-none z-10"
          style={{
            left: cursorRect.x,
            top: cursorRect.y,
            width: cursorRect.width,
            height: cursorRect.height,
            backgroundColor: `${cursorColor}32`,
            borderLeft: `3px solid ${cursorColor}`,
          }}
        />
      )}

      {active && shadow && (
        <div
          data-testid="note-input-shadow"
          className="absolute pointer-events-none z-20 rounded-full border-2 border-sky-600 bg-sky-400/45"
          style={{
            left: shadow.x,
            top: shadow.y,
            width: shadow.w,
            height: shadow.h,
            transform: 'rotate(-12deg)',
          }}
          title="Click to place note"
        />
      )}
    </>
  );
}
