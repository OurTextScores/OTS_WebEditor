'use client';

import React, { useEffect, useRef } from 'react';
import type { LyricsEntryPosition } from '../../../lib/webmscore-score-settings-types';
import { LYRICS_ACTIONS, lyricsKeyAction, lyricsLiteral, type LyricsAction } from './lyricsKeys';
import type { LyricsEntryModel } from './useLyricsEntry';

/**
 * The lyric being typed, in a box where it goes on the score (roadmap E17). Space, "-", "_", Enter and the arrows move
 * on as in MuseScore; Escape or leaving the box keeps the syllable and stops.
 */
export function LyricsEntryEditor({
  model,
  currentPage,
  zoom,
  engravingToOverlayPoint,
}: {
  /** The entry (useLyricsEntry): nothing shows while there is none. */
  model: Pick<LyricsEntryModel, 'entry' | 'commit'>;
  currentPage: number;
  zoom: number;
  engravingToOverlayPoint: (x: number, y: number) => { x: number; y: number };
}) {
  return model.entry ? (
    <LyricsEntryBox
      entry={model.entry}
      currentPage={currentPage}
      zoom={zoom}
      engravingToOverlayPoint={engravingToOverlayPoint}
      onCommit={model.commit}
    />
  ) : null;
}

function LyricsEntryBox({
  entry,
  currentPage,
  zoom,
  engravingToOverlayPoint,
  onCommit,
}: {
  entry: LyricsEntryPosition;
  currentPage: number;
  zoom: number;
  engravingToOverlayPoint: (x: number, y: number) => { x: number; y: number };
  onCommit: (text: string, action: LyricsAction) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Keys are committed in order, one after another; typing goes on meanwhile. A moving key takes the syllable typed so
  // far and empties the box at once, so what is typed while its commit runs belongs to the next syllable.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const ended = useRef(false);

  useEffect(() => {
    const box = input.current;
    if (!box) return;
    box.focus();
    // A syllable already there shows (selected, to retype), unless more is typed or queued.
    if (pending.current === 0 && box.value === '') {
      box.value = entry.text;
      box.select();
    }
  }, [entry]);

  if (entry.page !== currentPage) return null;
  const at = engravingToOverlayPoint(entry.x, entry.y);
  const run = (action: LyricsAction) => {
    const box = input.current;
    if (!box || ended.current) return;
    if (action === LYRICS_ACTIONS.end) ended.current = true;
    const text = box.value;
    box.value = '';
    pending.current += 1;
    queue.current = queue.current
      .then(() => onCommit(text, action))
      .finally(() => {
        pending.current -= 1;
      });
  };

  return (
    <input
      ref={input}
      data-testid="lyrics-entry"
      aria-label={`Lyrics, verse ${entry.verse + 1}`}
      className="absolute z-50 rounded border-2 border-accent bg-white px-1 py-0.5 text-base text-slate-900 shadow-raised outline-none"
      style={{
        left: at.x,
        top: at.y,
        width: '8rem',
        // Shown at 100% whatever the score zoom, as the text editor is.
        transform: `scale(${1 / zoom})`,
        transformOrigin: 'top left',
      }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        const literal = lyricsLiteral(event);
        if (literal) {
          event.preventDefault();
          event.currentTarget.setRangeText(
            literal,
            event.currentTarget.selectionStart ?? 0,
            event.currentTarget.selectionEnd ?? 0,
            'end',
          );
          return;
        }
        const action = lyricsKeyAction(event);
        if (action === null) return;
        event.preventDefault();
        run(action);
      }}
      onBlur={() => run(LYRICS_ACTIONS.end)}
    />
  );
}
