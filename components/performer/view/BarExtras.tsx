'use client';

import React from 'react';
import { MarksBackup } from '../annotations/MarksBackup';
import type { AnnotationStore } from '../annotations/annotationStore';
import { AddToSetlist } from '../setlists/AddToSetlist';

/** The control bar's piece tools: add to a setlist, back up or restore the marks. */
export function BarExtras({
  score,
  title,
  marks,
}: {
  score: string;
  title: string;
  marks: { store: AnnotationStore; reload: () => void };
}) {
  return (
    <>
      <AddToSetlist score={score} name={title} />
      <MarksBackup store={marks.store} onRestored={marks.reload} />
    </>
  );
}
