import React from 'react';
import { GLYPH_PATHS } from './glyphPaths.generated';

/**
 * The tool strip's icons are SVG on a 24 x 24 grid: notation symbols are SMuFL outlines (Leland, MuseScore's own
 * font, falling back to Bravura), fitted and centred by their real bounds so none can overflow its button, and
 * drawn parts (arrows, plus signs, fretboards) share one stroke. A part is a glyph or a path.
 */
export type IconPart =
  | {
      /** The SMuFL character (write it as an escape, e.g. '\uE050'). */
      readonly glyph: string;
      /** Where the glyph's centre goes on the 24 grid (default the middle). */
      readonly at?: readonly [number, number];
      /** The size of one em on the grid (default 16: a staff space is 4). Capped by `box`. */
      readonly em?: number;
      /** The most the glyph's longer side may measure (default 19). */
      readonly box?: number;
      /** The least it may measure: a small mark (a bow, a comma) is grown to this so it is not a speck (default 0). */
      readonly minSide?: number;
    }
  | {
      /** An SVG path on the 24 grid. */
      readonly path: string;
      /** Filled (solid shapes) instead of stroked. */
      readonly fill?: boolean;
      /** Stroke width (default 1.6). */
      readonly width?: number;
    };

export type IconSpec = readonly IconPart[];

const DEFAULT_EM = 16;
const DEFAULT_BOX = 19;

/** Where a glyph part lands on the grid: its scale and the box its ink fills. Exported so a test can check no icon overflows. */
export function placeGlyph(part: Extract<IconPart, { glyph: string }>) {
  const hex = part.glyph.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0') ?? '';
  const entry = GLYPH_PATHS[hex];
  if (!entry) return null;
  const [d, left, top, width, height] = entry;
  const side = Math.max(width, height);
  const box = part.box ?? DEFAULT_BOX;
  // The em the caller asked for, shrunk to fit the box, but never so small the glyph is a speck.
  const fitted = Math.min((part.em ?? DEFAULT_EM) / 1000, box / side);
  const scale = Math.max(fitted, Math.min((part.minSide ?? 0) / side, box / side));
  const [cx, cy] = part.at ?? [12, 12];
  const x = cx - (left + width / 2) * scale;
  const y = cy - (top + height / 2) * scale;
  return {
    d,
    scale,
    x,
    y,
    bounds: {
      left: cx - (width * scale) / 2,
      right: cx + (width * scale) / 2,
      top: cy - (height * scale) / 2,
      bottom: cy + (height * scale) / 2,
    },
  };
}

function GlyphPart({ part }: { part: Extract<IconPart, { glyph: string }> }) {
  const placed = placeGlyph(part);
  if (!placed) return null;
  return (
    <path
      d={placed.d}
      fill="currentColor"
      transform={`translate(${placed.x.toFixed(2)} ${placed.y.toFixed(2)}) scale(${placed.scale.toFixed(5)})`}
    />
  );
}

export function StripIcon({
  spec,
  size = 20,
  viewWidth = 24,
  glyphCode,
}: {
  spec: IconSpec;
  size?: number;
  /** The grid's width, for the icons that need to be wider than tall (default 24). */
  viewWidth?: number;
  /** The SMuFL code (hex) the icon shows, for tests and inspection. */
  glyphCode?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${viewWidth} 24`}
      width={(size * viewWidth) / 24}
      height={size}
      style={{ width: (size * viewWidth) / 24, height: size }}
      aria-hidden="true"
      focusable="false"
      data-glyph={glyphCode}
      className="shrink-0"
    >
      {spec.map((part, index) =>
        'glyph' in part ? (
          <GlyphPart key={index} part={part} />
        ) : (
          <path
            key={index}
            d={part.path}
            fill={part.fill ? 'currentColor' : 'none'}
            stroke={part.fill ? 'none' : 'currentColor'}
            strokeWidth={part.width ?? 1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </svg>
  );
}

/** SMuFL's articulation marks (accents, staccato, tenuto, marcato...): drawn over a notehead, as the palettes show them. */
const isArticulationMark = (code: number) => code >= 0xe4a0 && code <= 0xe4bf;

/** One glyph, fitted to a square: for menu cells and the faces of split buttons. */
export function GlyphIcon({ glyph, size = 20, em }: { glyph: string; size?: number; em?: number }) {
  const code = glyph.codePointAt(0) ?? 0;
  // Not a notation symbol (the key names): plain text.
  if (code < 0xe000) {
    return (
      <span aria-hidden="true" className="text-caption font-semibold">
        {glyph}
      </span>
    );
  }
  if (isArticulationMark(code)) {
    return (
      <StripIcon
        size={size}
        glyphCode={code.toString(16).toUpperCase()}
        spec={[
          { glyph: '\uE0A4', at: [11, 13.5], em: 21 },
          { path: 'M7.9 14V23.5', width: 1.1 },
          { glyph, at: [11, 5.5], em: 24, box: 11, minSide: 5 },
        ]}
      />
    );
  }
  return (
    <StripIcon
      size={size}
      glyphCode={code.toString(16).toUpperCase()}
      spec={[{ glyph, em: em ?? 18, box: 19, minSide: 8 }]}
    />
  );
}
