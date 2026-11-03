'use client';

import React from 'react';
import type { GripEditInfo } from '../../../lib/webmscore-loader';
import { LyricsEntryEditor, type LyricsEntryModel } from '../lyrics';
import { GripHandles } from './GripHandles';

/**
 * The in-place editing controls drawn over the score at engraving positions: an element's grips (Edit Element) and
 * the lyric being typed (roadmap E17). Each shows only while its edit is on.
 */
export function EditOverlays({
  gripEdit,
  lyricsEntry,
  currentPage,
  zoom,
  engravingToOverlayPoint,
  onGripPointerDown,
}: {
  gripEdit: GripEditInfo | null;
  lyricsEntry: Pick<LyricsEntryModel, 'entry' | 'commit'>;
  currentPage: number;
  zoom: number;
  engravingToOverlayPoint: (x: number, y: number) => { x: number; y: number };
  onGripPointerDown: (event: React.PointerEvent, gripIndex: number) => void;
}) {
  return (
    <>
      <GripHandles
        gripEdit={gripEdit}
        currentPage={currentPage}
        zoom={zoom}
        engravingToOverlayPoint={engravingToOverlayPoint}
        onGripPointerDown={onGripPointerDown}
      />
      <LyricsEntryEditor
        model={lyricsEntry}
        currentPage={currentPage}
        zoom={zoom}
        engravingToOverlayPoint={engravingToOverlayPoint}
      />
    </>
  );
}
