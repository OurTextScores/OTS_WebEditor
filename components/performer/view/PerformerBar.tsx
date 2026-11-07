'use client';

import React from 'react';
import { Button } from '../../ui/Button';
import type { PerformerDisplay } from '../platform/deviceSettings';
import type { PerformerPart } from '../session/usePerformerScore';
import { stepStaffScale } from '../session/devicePageStyle';

/**
 * The performer's controls, shown only on request (the view is locked while performing): the piece, the page, the
 * part, the staff size, half-page turns, the Play-through view (repeats written out), the pedal setup, and Done.
 */
export function PerformerBar({
  title,
  page,
  pageCount,
  parts,
  part,
  staffScale,
  halfPages,
  playThrough,
  reflow,
  display,
  wakeLockNote,
  onPart,
  onStaffScale,
  onHalfPages,
  onPlayThrough,
  onReflow,
  onDisplay,
  onPedals,
  onAnnotate,
  extra,
  onDone,
}: {
  title: string;
  page: number;
  pageCount: number;
  parts: readonly PerformerPart[];
  part: number;
  staffScale: number;
  halfPages: boolean;
  playThrough: boolean;
  reflow: boolean;
  display: PerformerDisplay;
  wakeLockNote: string | null;
  onPart: (part: number) => void;
  onStaffScale: (scale: number) => void;
  onHalfPages: (on: boolean) => void;
  onPlayThrough: (on: boolean) => void;
  onReflow: (on: boolean) => void;
  onDisplay: (display: PerformerDisplay) => void;
  onPedals: () => void;
  onAnnotate: () => void;
  /** More controls (the marks backup), before Done. */
  extra?: React.ReactNode;
  onDone: () => void;
}) {
  return (
    <div
      data-testid="performer-bar"
      data-performer-controls
      role="toolbar"
      aria-label="Performer controls"
      className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 text-sm text-slate-800 shadow-sm"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <span className="min-w-0 flex-1 truncate font-semibold" data-testid="performer-title">
        {title}
      </span>
      <span data-testid="performer-page" className="tabular-nums text-slate-600">
        Page {pageCount ? page + 1 : 0} of {pageCount}
      </span>
      {parts.length > 0 && (
        <select
          aria-label="Part"
          data-testid="performer-part"
          className="h-8 rounded border border-slate-300 bg-white px-2"
          value={part}
          onChange={(event) => onPart(Number(event.target.value))}
        >
          <option value={-1}>Full score</option>
          {parts.map((option) => (
            <option key={option.index} value={option.index}>
              {option.name}
            </option>
          ))}
        </select>
      )}
      <span className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          aria-label="Smaller music"
          disabled={!reflow}
          data-testid="performer-smaller"
          onClick={() => onStaffScale(stepStaffScale(staffScale, -1))}
        >
          A−
        </Button>
        <span
          className="text-center tabular-nums"
          style={{ minWidth: '3rem' }}
          data-testid="performer-size"
        >
          {reflow ? `${Math.round(staffScale * 100)}%` : 'As engraved'}
        </span>
        <Button
          type="button"
          size="sm"
          aria-label="Larger music"
          disabled={!reflow}
          data-testid="performer-larger"
          onClick={() => onStaffScale(stepStaffScale(staffScale, 1))}
        >
          A+
        </Button>
      </span>
      <label
        className="flex items-center gap-1.5"
        title="Lay the music out for this screen, ignoring the score's line and page breaks"
      >
        <input
          type="checkbox"
          data-testid="performer-reflow"
          checked={reflow}
          onChange={(event) => onReflow(event.target.checked)}
        />
        Reflow
      </label>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          data-testid="performer-half-pages"
          checked={halfPages}
          onChange={(event) => onHalfPages(event.target.checked)}
        />
        Half pages
      </label>
      <label
        className="flex items-center gap-1.5"
        title="The score with its repeats written out, in playing order"
      >
        <input
          type="checkbox"
          data-testid="performer-play-through"
          checked={playThrough}
          onChange={(event) => onPlayThrough(event.target.checked)}
        />
        Play-through
      </label>
      <select
        aria-label="Display"
        data-testid="performer-display"
        className="h-8 rounded border border-slate-300 bg-white px-2"
        value={display}
        onChange={(event) => onDisplay(event.target.value as PerformerDisplay)}
      >
        <option value="normal">Normal</option>
        <option value="high-contrast">High contrast</option>
        <option value="dark">Dark</option>
      </select>
      <Button type="button" size="sm" data-testid="performer-annotate" onClick={onAnnotate}>
        Annotate
      </Button>
      <Button type="button" size="sm" data-testid="performer-pedals" onClick={onPedals}>
        Pedals…
      </Button>
      {extra}
      {wakeLockNote && <span className="text-xs text-amber-700">{wakeLockNote}</span>}
      <Button
        type="button"
        size="sm"
        variant="primary"
        data-testid="performer-done"
        onClick={onDone}
      >
        Done
      </Button>
    </div>
  );
}
