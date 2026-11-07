'use client';

import React from 'react';
import { MarksBackup } from '../annotations/MarksBackup';
import { MarksCheckpoints } from '../annotations/MarksCheckpoints';
import type { AnnotationStore } from '../annotations/annotationStore';
import { AddToSetlist } from '../setlists/AddToSetlist';
import { editorHref } from '../platform/editorLink';
import { Button } from '../../ui/Button';

/** The control bar's piece tools: open in the editor, add to a setlist, export or import the marks. */
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
      <Button
        type="button"
        size="sm"
        data-testid="performer-open-editor"
        title="Open this score in the editor, in a new tab"
        onClick={() => window.open(editorHref(score), '_blank')}
      >
        Open in Editor
      </Button>
      <AddToSetlist score={score} name={title} />
      <MarksCheckpoints scoreKey={score} marks={marks.store} onRestored={marks.reload} />
      <MarksBackup store={marks.store} onRestored={marks.reload} />
    </>
  );
}
