import React from 'react';

// Small beamed-note icons for the beam-mode options, echoing MuseScore's beam
// palette (three eighth notes whose beaming reflects the chosen mode).
// Values match BeamMode: 0 auto, 1 none, 2 begin, 6 mid/join, 3 break-8th, 4 break-16th.

const STEM_X = [5.6, 19.6, 33.6];
const STEM_TOP = 4;
const STEM_BOTTOM = 16;

const Notehead: React.FC<{ x: number }> = ({ x }) => (
  <ellipse
    cx={x - 1.6}
    cy={STEM_BOTTOM}
    rx={2.6}
    ry={1.9}
    transform={`rotate(-20 ${x - 1.6} ${STEM_BOTTOM})`}
    fill="currentColor"
  />
);

const Stem: React.FC<{ x: number }> = ({ x }) => (
  <line x1={x} y1={STEM_TOP} x2={x} y2={STEM_BOTTOM} stroke="currentColor" strokeWidth={1} />
);

const Flag: React.FC<{ x: number }> = ({ x }) => (
  <path
    d={`M ${x} ${STEM_TOP} q 4 2.5 2.6 6`}
    stroke="currentColor"
    strokeWidth={1.4}
    fill="none"
  />
);

const Beam: React.FC<{ x1: number; x2: number; y: number }> = ({ x1, x2, y }) => (
  <rect x={x1} y={y} width={x2 - x1} height={2.4} fill="currentColor" />
);

export const BeamIcon: React.FC<{
  value: number;
  className?: string;
  /** Rendered size; the palettes use the default. */
  width?: number;
  height?: number;
}> = ({ value, className, width = 34, height = 18 }) => {
  const [a, b, c] = STEM_X;
  const flags = value === 1;
  return (
    <svg viewBox="0 0 40 22" width={width} height={height} className={className} aria-hidden="true">
      {STEM_X.map((x) => (
        <Stem key={`s${x}`} x={x} />
      ))}
      {STEM_X.map((x) => (
        <Notehead key={`n${x}`} x={x} />
      ))}
      {flags && STEM_X.map((x) => <Flag key={`f${x}`} x={x} />)}
      {/* Auto / mid: one continuous beam. */}
      {(value === 0 || value === 6) && <Beam x1={a} x2={c} y={STEM_TOP} />}
      {/* Begin: new beam group starts at the middle note. */}
      {value === 2 && (
        <>
          <Flag x={a} />
          <Beam x1={b} x2={c} y={STEM_TOP} />
        </>
      )}
      {/* Break secondary at 8th: primary beam continuous, split shown as a gap. */}
      {value === 3 && (
        <>
          <Beam x1={a} x2={(a + b) / 2 + 2} y={STEM_TOP} />
          <Beam x1={(b + c) / 2 - 2} x2={c} y={STEM_TOP} />
        </>
      )}
      {/* Break secondary at 16th: primary beam + a broken second beam. */}
      {value === 4 && (
        <>
          <Beam x1={a} x2={c} y={STEM_TOP} />
          <Beam x1={a} x2={(a + b) / 2 + 2} y={STEM_TOP + 3.4} />
          <Beam x1={(b + c) / 2 - 2} x2={c} y={STEM_TOP + 3.4} />
        </>
      )}
    </svg>
  );
};
