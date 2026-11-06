'use client';

import React from 'react';
import { fromSpaces, type PageGeometry } from './pageGeometry';
import { inkPath, type DrawnAnnotation } from './annotationPlacement';
import { MUSIC_FONT, stampOf, stampOrigin } from './stampGlyphs';

/**
 * The performer's annotations over the page: an SVG in the page's own units laid over the page's SVG, so each mark
 * sits where its anchor lands in this layout. Ink is a stroke (the highlighter a wide translucent one), stamps and
 * text are text, sized in staff spaces. A stroke being drawn is shown as it is made (`live`).
 */
export function AnnotationLayer({
  geometry,
  drawn,
  live,
}: {
  geometry: PageGeometry;
  drawn: readonly DrawnAnnotation[];
  live: { path: string; color: string; width: number; opacity: number } | null;
}) {
  return (
    <svg
      data-testid="annotation-layer"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {drawn.map((item) => {
        const { annotation, placement } = item;
        const key = `${annotation.id}:${item.occurrence ?? 'w'}`;
        if (annotation.kind === 'ink') {
          return (
            <path
              key={key}
              data-annotation={annotation.id}
              d={inkPath(item)}
              fill="none"
              stroke={annotation.style.color}
              strokeOpacity={annotation.style.opacity}
              strokeWidth={annotation.style.width * placement.space}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        const [dx, dy] = annotation.points[0] ?? [0, 0];
        const [x, y] = fromSpaces(placement, dx, dy);
        const stamp = annotation.kind === 'stamp' ? stampOf(annotation.content) : null;
        if (stamp?.font === 'music') {
          // An engraved glyph, its middle on the point it was put at
          const origin = stampOrigin(stamp, x, y, placement.space);
          return (
            <text
              key={key}
              data-annotation={annotation.id}
              data-stamp={stamp.id}
              data-center={`${x.toFixed(1)} ${y.toFixed(1)}`}
              x={origin.x}
              y={origin.y}
              fill={annotation.style.color}
              fillOpacity={annotation.style.opacity}
              fontSize={origin.fontSize}
              fontFamily={MUSIC_FONT}
            >
              {stamp.char}
            </text>
          );
        }
        return (
          <text
            key={key}
            data-annotation={annotation.id}
            data-stamp={stamp?.id}
            data-center={`${x.toFixed(1)} ${y.toFixed(1)}`}
            x={x}
            y={y}
            fill={annotation.style.color}
            fillOpacity={annotation.style.opacity}
            fontSize={(annotation.kind === 'stamp' ? 3 : 2.2) * placement.space}
            fontFamily="serif"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {stamp ? stamp.char : annotation.content}
          </text>
        );
      })}
      {live && (
        <path
          data-testid="annotation-live"
          d={live.path}
          fill="none"
          stroke={live.color}
          strokeOpacity={live.opacity}
          strokeWidth={live.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
