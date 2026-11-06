'use client';

import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import type { Annotation } from './annotationModel';
import { stampOf } from './stampGlyphs';
import type { useAnnotateMode } from './useAnnotateMode';

type AnnotateMode = ReturnType<typeof useAnnotateMode>;

const describe = (annotation: Annotation) =>
  annotation.kind === 'ink'
    ? `Drawing, bar ${annotation.anchor.bar + 1}`
    : `“${stampOf(annotation.content)?.label ?? annotation.content}”, bar ${annotation.anchor.bar + 1}`;

/** In Play-through, erasing a mark that is repeated: at all its occurrences, or only the one tapped? */
export function EraseScopeDialog({ mode }: { mode: AnnotateMode }) {
  if (!mode.eraseScope) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="erase-scope-title"
      data-testid="erase-scope"
      data-performer-controls
      className="absolute left-1/2 top-24 z-20 w-80 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-lg"
    >
      <p id="erase-scope-title" className="mb-3">
        This mark is repeated {mode.eraseScope.count} times in Play-through. Erase it everywhere or
        only here?
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" onClick={mode.cancelErase}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="erase-only-here"
          onClick={() => mode.eraseAt('one')}
        >
          Only this one
        </Button>
        <Button
          type="button"
          size="sm"
          variant="primary"
          data-testid="erase-all"
          onClick={() => mode.eraseAt('all')}
        >
          All {mode.eraseScope.count}
        </Button>
      </div>
    </div>
  );
}

/** Marks whose bar is no longer in the score: listed so they can be read and deleted, not silently lost. */
export function UnplacedTray({ mode }: { mode: AnnotateMode }) {
  const [open, setOpen] = useState(false);
  if (!mode.unplaced.length) return null;
  return (
    <span className="relative">
      <Button
        type="button"
        size="sm"
        data-testid="annotate-unplaced"
        onClick={() => setOpen(!open)}
      >
        Unplaced ({mode.unplaced.length})
      </Button>
      {open && (
        <ul
          data-testid="unplaced-list"
          className="absolute right-0 top-9 z-20 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
        >
          {mode.unplaced.map((annotation) => (
            <li key={annotation.id} className="flex items-center justify-between gap-2 py-1">
              <span className="truncate">{describe(annotation)}</span>
              <Button type="button" size="sm" onClick={() => void mode.removeUnplaced(annotation)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
