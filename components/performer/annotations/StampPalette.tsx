'use client';

import React from 'react';
import { Button } from '../../ui/Button';
import { MUSIC_FONT, STAMPS, type Stamp } from './stampGlyphs';

/** One stamp's glyph, fitted to its button: an SVG whose box is the glyph's (music font), or the text mark. */
function StampGlyph({ stamp }: { stamp: Stamp }) {
  if (stamp.font === 'text') return <span aria-hidden="true">{stamp.char}</span>;
  const [swX, swY, neX, neY] = stamp.box;
  const pad = 0.3;
  const width = neX - swX + 2 * pad;
  const height = neY - swY + 2 * pad;
  const side = Math.max(width, height, 2.2); // small marks (staccato) stay small, centred
  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox={`${(swX + neX) / 2 - side / 2} ${-(swY + neY) / 2 - side / 2} ${side} ${side}`}
    >
      <text x={0} y={0} fontSize={4} fontFamily={MUSIC_FONT} fill="currentColor">
        {stamp.char}
      </text>
    </svg>
  );
}

/**
 * The stamps to choose from, engraved as in the score (dynamics, fingerings, strings, breath, accidentals,
 * articulations): one row along the bottom edge, scrolling sideways, so the music under the tools stays in view.
 */
export function StampPalette({ stamp, onStamp }: { stamp: string; onStamp: (id: string) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Stamp"
      data-testid="annotate-stamps"
      data-performer-controls
      className="absolute inset-x-0 bottom-0 z-10 flex gap-1 overflow-x-auto border-t border-slate-200 bg-white/95 px-3 py-2 shadow-sm"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      {STAMPS.map((item, index) => (
        <Button
          key={item.id}
          type="button"
          size="sm"
          variant={stamp === item.id ? 'primary' : 'outline'}
          role="radio"
          aria-checked={stamp === item.id}
          aria-label={item.label}
          title={item.label}
          data-testid={`annotate-stamp-${item.id}`}
          className="shrink-0 p-0"
          // A little room between groups (dynamics, fingerings, …)
          style={
            index > 0 && STAMPS[index - 1].group !== item.group
              ? { marginLeft: '0.75rem' }
              : undefined
          }
          onClick={() => onStamp(item.id)}
        >
          <StampGlyph stamp={item} />
        </Button>
      ))}
    </div>
  );
}
