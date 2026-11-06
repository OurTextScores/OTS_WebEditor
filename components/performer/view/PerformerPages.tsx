'use client';

import React from 'react';
import type { BarBox } from '../session/barBoxes';
import { fillingSvg } from './pageSvgHeight';

/** One page's SVG filling the surface, optionally clipped to a horizontal band (fractions of the page's height). */
function PageLayer({
  svg,
  page,
  from = 0,
  to = 1,
  testId,
}: {
  svg: string;
  page: number;
  from?: number;
  to?: number;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      data-page={page}
      data-page-layer
      className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
      style={
        from > 0 || to < 1
          ? { clipPath: `inset(${from * 100}% 0 ${(1 - to) * 100}% 0)` }
          : undefined
      }
      // The engine's SVG, sanitized (sanitizeEngineSvg) before it gets here
      dangerouslySetInnerHTML={{ __html: fillingSvg(svg) }}
    />
  );
}

/**
 * The page or pages the performer sees: the current page; or, half turned, the bottom of the current page below the
 * top of the next (fractions of the page's height: `split` on this page, `nextTop` of the next), with a divider; and
 * the bar a repeat jump landed on, highlighted for a moment.
 */
export function PerformerPages({
  svg,
  nextSvg,
  page,
  half,
  flash,
}: {
  svg: string;
  nextSvg: string | null;
  page: number;
  half: { split: number; nextTop: number } | null;
  flash: BarBox | null;
}) {
  if (half && nextSvg) {
    return (
      <>
        {/* The bottom of this page, still being played, and the top of the next above it */}
        <PageLayer svg={svg} page={page} from={half.split} testId="performer-page-svg" />
        <PageLayer svg={nextSvg} page={page + 1} to={half.nextTop} testId="performer-next-top" />
        <div
          aria-hidden
          data-testid="performer-half-divider"
          className="pointer-events-none absolute inset-x-0 text-slate-400"
          style={{ top: `${half.split * 100}%`, borderTop: '2px dashed currentColor' }}
        />
      </>
    );
  }
  return (
    <>
      <PageLayer svg={svg} page={page} testId="performer-page-svg" />
      {flash && (
        <div
          aria-hidden
          data-testid="performer-jump-target"
          className="pointer-events-none absolute rounded text-sky-500"
          style={{
            left: `${flash.x * 100}%`,
            top: `${flash.y * 100}%`,
            width: `${flash.width * 100}%`,
            height: `${flash.height * 100}%`,
            outline: '3px solid currentColor',
          }}
        />
      )}
    </>
  );
}
