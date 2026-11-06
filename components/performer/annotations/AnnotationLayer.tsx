'use client';

import React from 'react';
import { fromSpaces, type PageGeometry } from './pageGeometry';
import { inkPath, type DrawnAnnotation } from './annotationPlacement';

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
        return (
          <text
            key={key}
            data-annotation={annotation.id}
            x={x}
            y={y}
            fill={annotation.style.color}
            fillOpacity={annotation.style.opacity}
            fontSize={(annotation.kind === 'stamp' ? 3 : 2.2) * placement.space}
            fontFamily="serif"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {annotation.content}
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
